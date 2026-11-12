import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {DatabaseSync} from "node:sqlite";
import {replyAddress,parseMailboxReply} from "../src/domain/reply-routing.ts";
import {setPause,recordMailboxDelivery,prepareDraft,approveDraft,readWorkspace,recordMailboxReply} from "../src/server/store.ts";
import {saveInboxConnection,inboxConfiguration,sealInboxSecret,openInboxSecret,clearInboxConnection,consumePendingInbox,inboxReadScope,inboxRedirect} from "../src/server/gmail-inbox-vault.ts";
import {beginInboxConnection,finishInboxConnection} from "../src/server/gmail-inbox-connection.ts";
import {pullReminderReplies,readMailboxJson} from "../src/server/gmail-inbox.ts";
const attemptId="12345678-1234-1234-1234-123456789abc",mailbox="owner@gmail.com",from="customer@example.test",alias=replyAddress(mailbox,attemptId),binding="a".repeat(64);
const message=(text="Please review the disputed work.")=>({id:"abc123",labelIds:["INBOX"],payload:{mimeType:"text/plain",headers:[{name:"From",value:`Customer <${from}>`},{name:"To",value:alias}],body:{data:Buffer.from(text).toString("base64url")}}});
function seed(){const draft=prepareDraft("birch");approveDraft("birch",draft.id,draft.subject,draft.body);const w=readWorkspace();w.emailAttempts=[{id:attemptId,caseId:"birch",draftId:"d",approvalId:"a",at:new Date().toISOString(),from:"demo@mail.example.test",to:from,replyTo:alias,subject:"Invoice",text:"Test",state:"accepted",providerId:"provider-1"}];const db=new DatabaseSync(path.join(process.cwd(),".data","local-demo.sqlite"));try{db.prepare("UPDATE demo_workspace SET payload=? WHERE id=1").run(JSON.stringify(w));}finally{db.close();}return w;}
async function isolated(fn:()=>Promise<void>){const old=process.cwd(),env={...process.env};process.chdir(mkdtempSync(path.join(os.tmpdir(),"nalbace-inbox-")));Object.assign(process.env,{NALBACE_INBOX_CLIENT_ID:"test.apps.googleusercontent.com",NALBACE_INBOX_CLIENT_SECRET:"synthetic",NALBACE_INBOX_ACCOUNT:mailbox,NALBACE_INBOX_STORAGE_KEY:Buffer.alloc(32,5).toString("base64")});try{await fn();}finally{process.chdir(old);for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);}}
test("reply routes are per attempt; malformed routes, wrong sender and ambiguous headers fail closed",()=>{
 assert.match(alias,/owner\+nalbace-/);assert.notEqual(alias,replyAddress(mailbox,"22345678-1234-1234-1234-123456789abc"));assert.throws(()=>replyAddress("owner+other@gmail.com",attemptId));assert.throws(()=>replyAddress(mailbox,"bad"));
 assert.equal(parseMailboxReply(message(),alias,from).text,"Please review the disputed work.");assert.throws(()=>parseMailboxReply(message(),alias,"wrong@example.test"));
 const duplicate=message();duplicate.payload.headers.push({name:"From",value:from});assert.throws(()=>parseMailboxReply(duplicate,alias,from));
 const sent=message();sent.labelIds=["SENT"];assert.throws(()=>parseMailboxReply(sent,alias,from));
 const html=message();html.payload.mimeType="text/html";assert.throws(()=>parseMailboxReply(html,alias,from));assert.throws(()=>parseMailboxReply(message("x".repeat(4001)),alias,from));
});
test("matched mailbox reply holds pursuit, invalidates approvals, preserves money, deduplicates and preserves suppression",async()=>isolated(async()=>{
 const before=seed(),financial=JSON.stringify(before.cases.find(c=>c.id==="birch")!.invoices);
 const input={connectionBinding:binding,mailbox,messageId:"abc123",alias,from,text:"I dispute the work."};const result=recordMailboxReply(input);assert.equal(result.result,"matched");assert.throws(()=>setPause("birch",false),/Review the customer reply/);
 let w=readWorkspace(),c=w.cases.find(c=>c.id==="birch")!;assert.equal(c.hold,"owner-review");assert.equal(w.approvals.length,0);assert.equal(JSON.stringify(c.invoices),financial);assert.equal(c.pastedReplies?.[0].source,"provider-received");
 recordMailboxReply({...input,connectionBinding:"b".repeat(64)});assert.equal(readWorkspace().cases.find(c=>c.id==="birch")!.pastedReplies?.length,1);assert.throws(()=>recordMailboxReply({...input,text:"changed"}));
 assert.equal(recordMailboxReply({...input,messageId:"abc124",from:"other@example.test"}).result,"unmatched");
 w=readWorkspace();w.cases.find(c=>c.id==="birch")!.hold="suppressed";const db=new DatabaseSync(path.join(process.cwd(),".data","local-demo.sqlite"));db.prepare("UPDATE demo_workspace SET payload=? WHERE id=1").run(JSON.stringify(w));db.close();recordMailboxReply({...input,messageId:"abc125"});assert.equal(readWorkspace().cases.find(c=>c.id==="birch")!.hold,"suppressed");
}));
test("authenticated bounded inbox pull matches a sent reminder without sending or mailbox mutation",async()=>isolated(async()=>{
 seed();const config=inboxConfiguration();saveInboxConnection({id:"inbox-1",email:mailbox,subject:"subject",binding:config.binding,refreshToken:"synthetic",accessToken:"synthetic",expiresAt:Date.now()+3600000});let calls=0;
 const request:typeof fetch=async(url,init)=>{calls++;assert.equal(init?.method,"GET");const u=String(url);return Response.json(u.endsWith("/profile")?{emailAddress:mailbox}:u.includes("?maxResults=")?{messages:[{id:"abc123"}]}:message());};
 const result=await pullReminderReplies(attemptId,request);assert.equal(result.matched,1);assert.equal(calls,3);assert.equal(readWorkspace().cases.find(c=>c.id==="birch")!.hold,"owner-review");
 await assert.rejects(pullReminderReplies(attemptId,request),/limited/);assert.equal(readWorkspace().cases.find(c=>c.id==="birch")!.pastedReplies?.length,1);
 await assert.rejects(pullReminderReplies(attemptId,async()=>Response.json({emailAddress:"other@gmail.com"})));clearInboxConnection();await assert.rejects(pullReminderReplies(attemptId,request));
}));
test("inbox secrets use authenticated separate encryption and response size is bounded",async()=>{
 const key=Buffer.alloc(32,2).toString("base64"),sealed=sealInboxSecret({secret:"test"},key);assert.equal(openInboxSecret<{secret:string}>(sealed,key).secret,"test");assert.throws(()=>openInboxSecret(sealed,Buffer.alloc(32,3).toString("base64")));
 await assert.rejects(readMailboxJson("https://evil.example/", "test"));await assert.rejects(readMailboxJson("https://gmail.googleapis.com/gmail/v1/users/me/profile","test",async()=>new Response("x".repeat(350001))));
});

test("inbox authorization requests read-only only, separate redirect, PKCE and single-use state",async()=>isolated(async()=>{
 const begin=await beginInboxConnection(),url=new URL(begin.url);assert.deepEqual((url.searchParams.get("scope")??"").split(" "),["openid","email",inboxReadScope]);assert.equal(url.searchParams.get("redirect_uri"),inboxRedirect);assert.equal(url.searchParams.get("include_granted_scopes"),"false");assert.equal(url.searchParams.get("code_challenge_method"),"S256");await assert.rejects(finishInboxConnection("code",begin.state,"wrong"),/state did not match/);assert.ok(consumePendingInbox(begin.state).verifier);assert.throws(()=>consumePendingInbox(begin.state),/start again/);
}));

test("wrong authenticated mailbox is rejected before any message read",async()=>isolated(async()=>{
 seed();const config=inboxConfiguration();saveInboxConnection({id:"wrong-profile-test",email:mailbox,subject:"subject",binding:config.binding,refreshToken:"synthetic",accessToken:"synthetic",expiresAt:Date.now()+3600000});let calls=0;
 await assert.rejects(pullReminderReplies(attemptId,async()=>{calls++;return Response.json({emailAddress:"other@gmail.com"});}),/identity does not match/);assert.equal(calls,1);assert.equal(readWorkspace().inboundEvents?.length??0,0);
}));
test("disconnect during a read prevents reply persistence",async()=>isolated(async()=>{
 seed();const config=inboxConfiguration();saveInboxConnection({id:"disconnect-test",email:mailbox,subject:"subject",binding:config.binding,refreshToken:"synthetic",accessToken:"synthetic",expiresAt:Date.now()+3600000});let calls=0;
 await assert.rejects(pullReminderReplies(attemptId,async(url)=>{calls++;if(String(url).endsWith("/profile"))return Response.json({emailAddress:mailbox});if(String(url).includes("?maxResults="))return Response.json({messages:[{id:"abc123"}]});clearInboxConnection();return Response.json(message());}),/connection changed/);assert.equal(calls,3);assert.equal(readWorkspace().inboundEvents?.length??0,0);
}));
test("an unknown original send cannot be silently matched or relabelled accepted by a reply",async()=>isolated(async()=>{
 const w=seed();w.emailAttempts![0].state="unknown";const db=new DatabaseSync(path.join(process.cwd(),".data","local-demo.sqlite"));db.prepare("UPDATE demo_workspace SET payload=? WHERE id=1").run(JSON.stringify(w));db.close();
 const result=recordMailboxReply({connectionBinding:binding,mailbox,messageId:"abc123",alias,from,text:"A reply"});assert.equal(result.result,"unmatched");assert.equal(readWorkspace().emailAttempts![0].state,"unknown");assert.equal(readWorkspace().cases.find(c=>c.id==="birch")!.pastedReplies?.length??0,0);
}));

test("self-sent replies require the explicit self-test parser option; spam and drafts stay excluded",()=>{
 const m=message();m.labelIds=["INBOX","SENT"];assert.throws(()=>parseMailboxReply(m,alias,from));assert.equal(parseMailboxReply(m,alias,from,true).messageId,"abc123");m.labelIds=["INBOX","SENT","SPAM"];assert.throws(()=>parseMailboxReply(m,alias,from,true));
});

test("received-copy evidence is bound and idempotent without implying payment or permitting a resend",async()=>isolated(async()=>{
 const seeded=seed();seeded.emailAttempts![0].to=mailbox;const db=new DatabaseSync(path.join(process.cwd(),".data","local-demo.sqlite"));db.prepare("UPDATE demo_workspace SET payload=? WHERE id=1").run(JSON.stringify(seeded));db.close();const input={attemptId,mailbox,binding,messageId:"abc123",replyTo:alias};recordMailboxDelivery(input);recordMailboxDelivery(input);const w=readWorkspace();assert.equal(w.emailAttempts![0].state,"accepted");assert.equal(w.emailAttempts![0].receivedCopy?.messageId,"abc123");assert.throws(()=>recordMailboxDelivery({...input,replyTo:"wrong@gmail.com"}));assert.throws(()=>recordMailboxDelivery({...input,messageId:"abc124"}));
}));
