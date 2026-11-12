import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fixtures} from "../src/server/fixtures.ts";
import {accountPriority} from "../src/domain/account-priority.ts";
import {contactEligibility} from "../src/domain/case-rules.ts";
import {runAutomaticFollowup} from "../src/domain/automatic-followup.ts";
import type {WorkspaceControls} from "../src/domain/workspace-controls.ts";
import {readWorkspace,saveCustomerCalling,saveCustomerFollowup,saveReminderPolicy,tickAutomaticReminders,recordCustomerUpdate,reviewDispute} from "../src/server/store.ts";
import {customerAllowsAiCalls} from "../src/domain/customer-calling.ts";

const controls:WorkspaceControls={revision:0,aiPaused:true,aiRequestCap:0,reminderPolicy:{enabled:true,beforeDays:7,businessName:"Sample merchant"}};
function customer(){
  const client=fixtures(new Date("2026-11-12T17:00:00Z"))[1];
  client.invoices.forEach(invoice=>invoice.dueDate="2026-11-12");
  client.nextActionAt="2026-10-01T17:00:00Z";
  client.lastContactAt=null;
  return client;
}
function isolated(run:()=>void){
  const before=process.cwd();process.chdir(mkdtempSync(join(tmpdir(),"nalbace-auto-")));
  try{run();}finally{process.chdir(before);}
}

test("courtesy dates run once and missed notices are not caught up",()=>{
  const client=customer();
  runAutomaticFollowup(client,controls,"2026-11-05");
  assert.equal(client.automaticFollowup!.completed.length,1);
  runAutomaticFollowup(client,controls,"2026-11-05");
  assert.equal(client.automaticFollowup!.completed.length,1);
  runAutomaticFollowup(client,controls,"2026-11-12");
  assert.equal(client.automaticFollowup!.completed.length,2);
  const late=customer();runAutomaticFollowup(late,controls,"2026-11-08");
  assert.equal(late.automaticFollowup!.completed.length,0);
  const early=customer();runAutomaticFollowup(early,{...controls,reminderPolicy:{...controls.reminderPolicy!,beforeDays:14}},"2026-10-29");
  assert.equal(early.automaticFollowup!.completed[0].key,"before");
});

test("email-only customer never receives a call even with recorded voice permission",()=>{
  const client=customer();
  client.aiCallPreference="email-only";
  client.contactPermission={emailAllowed:true,voiceAllowed:true,phone:"+12025550123",note:"Synthetic",reviewedAt:"2026-11-01T17:00:00Z"};
  for(const date of ["2026-11-13","2026-11-20","2026-11-27","2026-12-04"])runAutomaticFollowup(client,controls,date);
  assert.deepEqual(client.automaticFollowup!.completed.map(step=>step.channel),["email","email"]);
  assert.equal(client.automaticFollowup!.status,"owner-review");
  assert.equal(contactEligibility(client,new Date("2026-12-04T17:00:00Z"),"voice").eligible,false);
  client.aiCallPreference="allow";
  runAutomaticFollowup(client,controls,"2026-12-11");
  assert.equal(client.automaticFollowup!.completed.length,2);
});

test("permitted customer receives one grouped call after two spaced emails",()=>{
  const client=customer();client.aiCallPreference="allow";
  client.contactPermission={emailAllowed:true,voiceAllowed:true,phone:"+12025550123",note:"Synthetic",reviewedAt:"2026-11-01T17:00:00Z"};
  for(const date of ["2026-11-13","2026-11-20","2026-11-27","2026-11-27","2026-12-04"])runAutomaticFollowup(client,controls,date);
  assert.deepEqual(client.automaticFollowup!.completed.map(step=>step.channel),["email","email","call"]);
  assert.equal(client.automaticFollowup!.invoiceIds.length,2);
  assert.equal(client.automaticFollowup!.status,"owner-review");
});

test("reply, dispute, stop and pending check prevent automated contact",()=>{
  for(const hold of ["dispute","suppressed","owner-review"] as const){
    const client=customer();client.hold=hold;runAutomaticFollowup(client,controls,"2026-11-13");
    assert.equal(client.automaticFollowup!.completed.length,0);
  }
  const client=customer();client.pastedReplies=[{id:"reply",at:"2026-11-12T17:00:00Z",source:"owner-pasted",text:"I paid"}];
  runAutomaticFollowup(client,controls,"2026-11-13");assert.equal(client.automaticFollowup!.completed.length,0);
  const pending=customer();pending.receipts=[{id:"check",kind:"check",state:"received",receivedAt:"2026-11-12T17:00:00Z",allocations:[{invoiceId:pending.invoices[0].id,amountMinor:1000}]}];
  runAutomaticFollowup(pending,controls,"2026-11-13");assert.equal(pending.automaticFollowup!.completed.length,0);
});

test("settlement stops a running sequence; disabled policy never creates one",()=>{
  const client=customer();runAutomaticFollowup(client,controls,"2026-11-13");
  client.invoices.forEach(invoice=>invoice.balanceMinor=0);
  runAutomaticFollowup(client,controls,"2026-11-20");
  assert.equal(client.automaticFollowup!.status,"settled");assert.equal(client.automaticFollowup!.completed.length,1);
  const disabled=customer();runAutomaticFollowup(disabled,{...controls,reminderPolicy:{...controls.reminderPolicy!,enabled:false}},"2026-11-13");
  assert.equal(disabled.automaticFollowup,undefined);
});

test("saved policy ticks deduplicate and customer calling is durable across invoices",()=>isolated(()=>{
  let client=readWorkspace().cases.find(item=>item.id==="birch")!;
  saveCustomerCalling(client.id,client.version,false);
  saveReminderPolicy({enabled:true,beforeDays:7,businessName:"Sample merchant"},0);
  tickAutomaticReminders();tickAutomaticReminders();
  client=readWorkspace().cases.find(item=>item.id==="birch")!;
  assert.equal(client.aiCallPreference,"email-only");
  assert.equal(client.automaticFollowup!.completed.length,1);
  assert.equal(readWorkspace().emailAttempts?.length??0,0);
  assert.equal(readWorkspace().voiceCalls?.length??0,0);
}));

test("resolved disputed balance with a promise re-enters the sample schedule only after its date",()=>isolated(()=>{
  saveReminderPolicy({enabled:true,beforeDays:7,businessName:"Sample merchant"},0);
  recordCustomerUpdate("birch","dispute","Invoice correction needed",null,"auto-dispute");
  const client=readWorkspace().cases.find(item=>item.id==="birch")!;
  const reviewAt=new Date(Date.now()+7*86400000).toISOString();
  reviewDispute("birch",client.version,{resolution:"resolved",note:"Customer accepts the balance",reference:"Synthetic conversation",nextAction:"payment-promise",reviewAt,operationId:"auto-resolve"});
  tickAutomaticReminders();
  const after=readWorkspace().cases.find(item=>item.id==="birch")!;
  assert.equal(after.hold,"none");
  assert.equal(after.nextActionAt,reviewAt);
  assert.equal(after.automaticFollowup!.completed.length,0);
  assert.equal(after.automaticFollowup!.status,"held");
  saveReminderPolicy({enabled:true,beforeDays:7,businessName:"Sample merchant",demoDate:reviewAt.slice(0,10)},1);
  assert.equal(readWorkspace().cases.find(item=>item.id==="birch")!.automaticFollowup!.completed.length,1);
}));

test("routine sample automation leaves the action queue until an exception needs the owner",()=>{
  const client=customer();runAutomaticFollowup(client,controls,"2026-11-13");
  assert.equal(accountPriority(client,controls,new Date("2026-11-13T17:00:00Z")).group,"waiting");
  runAutomaticFollowup(client,controls,"2026-11-20");
  assert.equal(accountPriority(client,controls,new Date("2026-11-20T17:00:00Z")).group,"review");
});

test("customer defaults are email on and AI off; preferences save without inventing agreement or clearing a hold",()=>isolated(()=>{
  let client=readWorkspace().cases.find(item=>item.id==="birch")!;
  assert.notEqual(client.emailFollowupEnabled,false);
  assert.equal(customerAllowsAiCalls(client),false);
  recordCustomerUpdate(client.id,"dispute","Synthetic issue",null,"preferences-dispute");
  client=readWorkspace().cases.find(item=>item.id==="birch")!;
  assert.throws(()=>saveCustomerFollowup(client.id,client.version,false,true),/agreement/);
  saveCustomerFollowup(client.id,client.version,false,false);
  client=readWorkspace().cases.find(item=>item.id==="birch")!;
  assert.equal(client.emailFollowupEnabled,false);
  assert.equal(client.aiCallPreference,"email-only");
  assert.equal(client.contactPermission,undefined);
  assert.equal(client.permissionReviews,undefined);
  assert.equal(client.hold,"dispute");
  client.hold="none";
  assert.equal(contactEligibility(client,new Date(),"email").eligible,false);
  assert.equal(contactEligibility(client,new Date(),"voice").eligible,false);
}));

test("Elm sample history explains the check hold and blocks later reminders",()=>{
 const now=new Date("2026-11-12T17:00:00Z"),client=fixtures(now)[0];
 assert.equal(client.automaticFollowup?.completed[0].on,"2026-10-29");
 assert.match(client.pastedReplies![0].text,/delivered a \$400\.00 check/);
 assert.equal(client.receipts[0].state,"received");
 const previous=JSON.stringify(client.automaticFollowup!.completed);
 runAutomaticFollowup(client,controls,"2026-11-12");
 assert.equal(client.automaticFollowup!.status,"held");
 assert.match(client.automaticFollowup!.reason,/check/i);
 assert.equal(JSON.stringify(client.automaticFollowup!.completed),previous);
 assert.equal(contactEligibility(client,now).eligible,false);
});
