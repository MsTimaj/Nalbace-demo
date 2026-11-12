import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {fixtures} from "../src/server/fixtures.ts";
import {replyContext,validateReplyProposal} from "../src/domain/reply-review.ts";
import {accountPriority} from "../src/domain/account-priority.ts";
import {recordCustomerUpdate,readWorkspace,savePriorityPreference,saveWorkspaceControls,setPause,recordPastedReply,recordReceipt,reserveAiReply,completeAiReply} from "../src/server/store.ts";
const now=new Date("2026-11-10T17:00:00Z");
function temporary(fn:()=>void){const before=process.cwd();process.chdir(mkdtempSync(path.join(os.tmpdir(),"nalbace-priority-")));try{fn();}finally{process.chdir(before);}}
test("paid disputes and owner relationship concerns remain urgent; paid alone is not a health guarantee",()=>{
 const c=fixtures(now)[1];c.invoices.forEach(i=>i.balanceMinor=0);c.hold="dispute";assert.equal(accountPriority(c,undefined,now).group,"urgent");
 c.hold="owner-review";c.customerUpdates=[{id:"concern",kind:"relationship-concern",note:"Customer says they will not return.",at:now.toISOString(),followUpAt:null,source:"owner-recorded"}];assert.equal(accountPriority(c,undefined,now).group,"urgent");
 c.customerUpdates.push({id:"resolved",kind:"relationship-resolved",note:"Owner addressed concern.",at:now.toISOString(),followUpAt:null,source:"owner-recorded"});assert.notEqual(accountPriority(c,undefined,now).group,"urgent");
});
test("overdue threshold is configurable; a polite reply alone does not become a relationship concern",()=>{
 const c=fixtures(now)[1];c.invoices.forEach(i=>i.dueDate="2026-10-01");c.hold="owner-review";c.pastedReplies=[{id:"r",at:now.toISOString(),source:"provider-received",text:"Thank you, I am running behind but appreciate your work."}];
 assert.equal(accountPriority(c,undefined,now).group,"review");assert.equal(accountPriority(c,{revision:0,aiPaused:true,aiRequestCap:0,urgentOverdueDays:30},now).group,"urgent");assert.equal(accountPriority(c,{revision:0,aiPaused:true,aiRequestCap:0,urgentOverdueDays:180},now).group,"review");
 c.invoices.forEach(i=>i.balanceMinor=0);assert.equal(accountPriority(c,{revision:0,aiPaused:true,aiRequestCap:0,urgentOverdueDays:1},now).group,"review");
});
test("AI flagged concerns prioritize review with exact evidence without changing money or confirming emotion",()=>{
 const c=fixtures(now)[1];c.hold="owner-review";c.invoices.forEach(i=>i.balanceMinor=0);c.pastedReplies=[{id:"r",at:now.toISOString(),source:"provider-received",text:"I paid but I will never work with you again.",proposal:{replyId:"r",caseVersion:c.version,intent:"relationship-concern",quote:"I will never work with you again",question:"Would the owner review this relationship concern?",provider:"fake",model:"offline"}}];
 const result=accountPriority(c,undefined,now);assert.equal(result.group,"urgent");assert.equal(result.aiConcern,true);assert.match(result.reason,/possible concern/);assert.equal(result.remaining,0);assert.equal(c.hold,"owner-review");
});
test("owner priority edits preserve quotas and reject invalid or stale updates",()=>temporary(()=>{
 savePriorityPreference(30,0);assert.equal(readWorkspace().controls?.urgentOverdueDays,30);assert.equal(readWorkspace().controls?.aiRequestCap,0);assert.throws(()=>savePriorityPreference(90,0),/another change/);assert.throws(()=>savePriorityPreference(0,1),/1 to 3650/);saveWorkspaceControls({revision:1,aiPaused:true,aiRequestCap:0});assert.equal(readWorkspace().controls?.urgentOverdueDays,30);
}));
test("relationship concern cannot be resumed away; resolving preserves stops and finances",()=>temporary(()=>{
 const original=readWorkspace().cases.find(c=>c.id==="birch")!;recordCustomerUpdate("birch","relationship-concern","Customer says they will not return.",null,"relationship-concern-1");assert.throws(()=>setPause("birch",false),/relationship concern/);recordCustomerUpdate("birch","stop","Customer requested no contact.",null,"relationship-stop-1");recordCustomerUpdate("birch","relationship-resolved","Owner resolved the complaint.",null,"relationship-resolved-1");const after=readWorkspace().cases.find(c=>c.id==="birch")!;assert.equal(after.hold,"suppressed");assert.deepEqual(after.invoices,original.invoices);assert.throws(()=>setPause("birch",false),/explicit owner resolution/);
}));
test("fully paid reply can receive a bounded relationship suggestion without reopening the balance",()=>temporary(()=>{
 recordReceipt("birch","cash",[{invoiceId:"inv-birch-1041",amountMinor:25000},{invoiceId:"inv-birch-1045",amountMinor:15000}],"paid-health-1");recordPastedReply("birch","I paid but I will never work with you again.","paid-reply-1");saveWorkspaceControls({revision:0,aiPaused:false,aiRequestCap:1});const run=reserveAiReply("birch","paid-reply-1",1);completeAiReply(run.runId,{replyId:run.context.replyId,caseVersion:run.context.caseVersion,intent:"relationship-concern",quote:"I will never work with you again",question:"Should the owner address the customer's concern?"},"fake","offline");const c=readWorkspace().cases.find(c=>c.id==="birch")!;assert.equal(accountPriority(c).group,"urgent");assert.equal(accountPriority(c).remaining,0);
}));

test("AI interpretation uses the customer's new reply, not the quoted reminder",()=>{
 const c=fixtures(now)[1];c.hold="owner-review";c.pastedReplies=[{id:"r",at:now.toISOString(),source:"provider-received",text:"Thank you, I am happy with your work.\n\nOn Tue, someone wrote:\n> Please report a dispute."}];const context=replyContext(c,"r");assert.equal(context.text,"Thank you, I am happy with your work.");assert.throws(()=>validateReplyProposal({replyId:"r",caseVersion:c.version,intent:"dispute",quote:"Please report a dispute.",question:"Review?"},context));
});

test("settled manual pauses do not require a payment decision",()=>{const c=fixtures(now)[1];c.invoices.forEach(i=>i.balanceMinor=0);c.hold="owner-review";assert.equal(accountPriority(c,undefined,now).group,"waiting");assert.match(accountPriority(c,undefined,now).reason,/Settled/);c.hold="dispute";assert.equal(accountPriority(c,undefined,now).group,"urgent");});
