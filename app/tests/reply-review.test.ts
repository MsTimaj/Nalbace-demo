import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {readWorkspace,prepareDraft,approveDraft,recordPastedReply,saveWorkspaceControls,reserveAiReply,completeAiReply,failAiDraft,recordCustomerUpdate} from "../src/server/store.ts";
import {financials,contactEligibility} from "../src/domain/cases.ts";
import {validateReplyProposal} from "../src/domain/reply-review.ts";
import {claudeReplyModel} from "../src/server/model-adapter.ts";
const text="I sent a check on Friday. Please don't call me about this.";
function temporary(fn:()=>void){const before=process.cwd();process.chdir(mkdtempSync(path.join(os.tmpdir(),"nalbace-reply-")));try{fn();}finally{process.chdir(before);}}
const proposal=(context:{replyId:string;caseVersion:number})=>({...context,intent:"unclear",quote:"Please don't call me",question:"Does this request stop calls, or all follow-up? Confirm with the owner."});
test("saved reply holds before AI, preserves exact text, invalidates approval and deduplicates",()=>temporary(()=>{
  const d=prepareDraft("birch");approveDraft("birch",d.id,d.subject,d.body);
  recordPastedReply("birch",text,"pasted-reply-1");recordPastedReply("birch",text,"pasted-reply-1");
  const w=readWorkspace(),c=w.cases.find(c=>c.id==="birch")!;
  assert.equal(c.pastedReplies?.length,1);assert.equal(c.pastedReplies?.[0].text,text);assert.equal(c.hold,"owner-review");assert.equal(w.approvals.length,0);assert.equal(w.aiRuns?.length??0,0);assert.equal(financials(c).remainingMinor,40000);
  assert.throws(()=>recordPastedReply("birch","Changed","pasted-reply-1"),/text changed/);
  assert.throws(()=>prepareDraft("birch"),/owner decision/);
}));
test("reply suggestions require exact evidence and cannot grant money or execution authority",()=>{
  const context={replyId:"reply-1",caseVersion:4,text,history:[]},valid=proposal({replyId:context.replyId,caseVersion:context.caseVersion});
  assert.equal(validateReplyProposal(valid,context).intent,"unclear");
  for(const invalid of [{...valid,quote:"The invoice is verified paid"},{...valid,caseVersion:5},{...valid,replyId:"another"},{...valid,send:true},{...valid,amountMinor:0},{...valid,intent:"mark-paid"},{...valid,question:""}])assert.throws(()=>validateReplyProposal(invalid,context));
});
test("interpreting a held reply uses the shared allowance and leaves balances, date and contact permission unchanged",()=>temporary(()=>{
  recordPastedReply("birch",text,"pasted-reply-2");saveWorkspaceControls({revision:0,aiPaused:false,aiRequestCap:1});
  const before=readWorkspace().cases.find(c=>c.id==="birch")!,run=reserveAiReply("birch","pasted-reply-2",1);
  completeAiReply(run.runId,proposal({replyId:run.context.replyId,caseVersion:run.context.caseVersion}),"fake-provider","fake-model");
  const w=readWorkspace(),c=w.cases.find(c=>c.id==="birch")!;
  assert.equal(c.hold,"owner-review");assert.deepEqual(c.invoices,before.invoices);assert.equal(c.nextActionAt,before.nextActionAt);assert.equal(c.contactPermission,before.contactPermission);assert.equal(w.approvals.length,0);assert.equal(w.aiRuns?.[0].state,"succeeded");assert.equal(contactEligibility(c,new Date()).eligible,false);
}));
test("late reply output cannot override an intervening stop; failures do not restore allowance",()=>temporary(()=>{
  recordPastedReply("birch",text,"pasted-reply-3");saveWorkspaceControls({revision:0,aiPaused:false,aiRequestCap:1});
  const run=reserveAiReply("birch","pasted-reply-3",1);
  recordCustomerUpdate("birch","stop","Owner confirmed no contact.",null,"reply-stop-1");
  assert.throws(()=>completeAiReply(run.runId,proposal({replyId:run.context.replyId,caseVersion:run.context.caseVersion}),"fake","fake"),/case changed/);failAiDraft(run.runId);
  assert.equal(readWorkspace().cases.find(c=>c.id==="birch")!.hold,"suppressed");assert.equal(readWorkspace().aiRuns?.length,1);
  assert.throws(()=>reserveAiReply("birch","pasted-reply-3",1),/stopped or disputed/);
}));
test("reply model gets no tools or destinations and sends only one bounded request",async()=>{
  let calls=0;const context={replyId:"reply-4",caseVersion:1,text,history:[]};
  const request:typeof fetch=async(url,init)=>{calls++;assert.equal(url,"https://api.anthropic.com/v1/messages");const body=JSON.parse(String(init?.body));assert.equal(body.max_tokens,600);assert.equal(body.tools,undefined);assert.equal(init?.redirect,"error");return Response.json({stop_reason:"end_turn",content:[{type:"text",text:JSON.stringify(proposal({replyId:context.replyId,caseVersion:context.caseVersion}))}]});};
  const result=await claudeReplyModel("fake-key","fake-model",request).interpret(context);assert.equal(validateReplyProposal(result,context).intent,"unclear");assert.equal(calls,1);
});
