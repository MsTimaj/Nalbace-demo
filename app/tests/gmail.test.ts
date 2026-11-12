import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {randomBytes} from "node:crypto";
import {gmailConfiguration,gmailSendScope,gmailRedirect,sealGmailSecret,openGmailSecret,saveGmailConnection,readGmailConnection,clearGmailConnection,consumePendingGmail} from "../src/server/gmail-vault.ts";
import {beginGmailConnection,finishGmailConnection} from "../src/server/gmail-connection.ts";
import {gmailRawMessage,submitGmailTestEmail} from "../src/server/gmail-delivery.ts";
import {emailConfiguration} from "../src/server/email-delivery.ts";
import {readWorkspace} from "../src/server/store.ts";
import type {EmailAttempt} from "../src/domain/email-delivery.ts";
const account="owner@gmail.com";
const attempt:EmailAttempt={id:"test-gmail-attempt",caseId:"test",draftId:"d",approvalId:"a",at:new Date().toISOString(),from:account,to:account,subject:"Résumé: invoice #1041",text:"Exact reviewed body\nBcc: nobody@example.test",state:"reserved"};
async function temporary(fn:()=>Promise<void>|void){
  const before=process.cwd(),names=["NALBACE_GMAIL_CLIENT_ID","NALBACE_GMAIL_CLIENT_SECRET","NALBACE_GMAIL_ACCOUNT","NALBACE_GMAIL_STORAGE_KEY"],previous=new Map(names.map(name=>[name,process.env[name]]));
  process.chdir(mkdtempSync(path.join(os.tmpdir(),"nalbace-gmail-")));
  process.env.NALBACE_GMAIL_CLIENT_ID="synthetic.apps.googleusercontent.com";process.env.NALBACE_GMAIL_CLIENT_SECRET="synthetic-secret";process.env.NALBACE_GMAIL_ACCOUNT=account;process.env.NALBACE_GMAIL_STORAGE_KEY=randomBytes(32).toString("base64");
  try{await fn();}finally{process.chdir(before);for(const name of names){const value=previous.get(name);if(value===undefined)delete process.env[name];else process.env[name]=value;}}
}
test("Gmail setup and delivery stay disabled without explicit credentials, connection and selected provider",()=>{
  assert.equal(gmailConfiguration({}).setupReady,false);
  assert.equal(emailConfiguration({NALBACE_EMAIL_PROVIDER:"unknown",NALBACE_EMAIL_ENABLED:"true",RESEND_API_KEY:"fake-key",NALBACE_EMAIL_FROM:account,NALBACE_EMAIL_TEST_RECIPIENT:account,NALBACE_EMAIL_MAX_ATTEMPTS:"1"}).ready,false);
  assert.equal(emailConfiguration({NALBACE_EMAIL_PROVIDER:"gmail",NALBACE_EMAIL_ENABLED:"true",NALBACE_EMAIL_FROM:account,NALBACE_EMAIL_TEST_RECIPIENT:account,NALBACE_EMAIL_MAX_ATTEMPTS:"1"}).ready,false);
});
test("OAuth uses send-only scope, exact loopback callback, random state and PKCE; pending state is single-use",async()=>temporary(async()=>{
  const begin=await beginGmailConnection(),url=new URL(begin.url),scopes=(url.searchParams.get("scope")??"").split(" ");
  assert.equal(url.origin,"https://accounts.google.com");assert.equal(url.searchParams.get("redirect_uri"),gmailRedirect);assert.deepEqual(scopes,["openid","email",gmailSendScope]);assert.equal(url.searchParams.get("code_challenge_method"),"S256");assert.ok(url.searchParams.get("code_challenge"));assert.equal(url.searchParams.get("include_granted_scopes"),"false");
  assert.throws(()=>consumePendingGmail("wrong-state"),/expired or changed/);
  await assert.rejects(finishGmailConnection("fake-code",begin.state,"wrong-cookie"),/state did not match/);
  const pending=consumePendingGmail(begin.state);assert.ok(pending.verifier.length>=43);assert.throws(()=>consumePendingGmail(begin.state),/start again/);
}));
test("Gmail credentials are encrypted separately from browser workspace data, reject tampering and disconnect locally",async()=>temporary(()=>{
  const c=gmailConfiguration(),secret={id:"connection-1",email:account,subject:"google-user-id",binding:c.binding,refreshToken:"SYNTHETIC_REFRESH_SECRET",accessToken:"SYNTHETIC_ACCESS_SECRET",expiresAt:Date.now()+3600000};
  saveGmailConnection(secret);assert.equal(readGmailConnection()?.id,secret.id);
  const bytes=readFileSync(path.join(process.cwd(),".data","gmail-auth.sqlite"));assert.equal(bytes.includes(Buffer.from(secret.refreshToken)),false);assert.equal(bytes.includes(Buffer.from(secret.accessToken)),false);assert.equal(JSON.stringify(readWorkspace()).includes(secret.refreshToken),false);
  const sealed=sealGmailSecret(secret,c.key);assert.deepEqual(openGmailSecret(sealed,c.key),secret);assert.throws(()=>openGmailSecret(sealed,randomBytes(32).toString("base64")));
  const parts=sealed.split(".");parts[2]=(parts[2][0]==="A"?"B":"A")+parts[2].slice(1);assert.throws(()=>openGmailSecret(parts.join("."),c.key));
  process.env.NALBACE_GMAIL_ACCOUNT="another@gmail.com";assert.equal(readGmailConnection(),null);process.env.NALBACE_GMAIL_ACCOUNT=account;
  clearGmailConnection();assert.equal(readGmailConnection(),null);
}));
test("Gmail can only send to the connected personal account in this controlled test",async()=>temporary(()=>{
  const c=gmailConfiguration();saveGmailConnection({id:"connection-2",email:account,subject:"user-2",binding:c.binding,refreshToken:"fake-refresh",accessToken:"fake-access",expiresAt:Date.now()+3600000});
  const base={NALBACE_EMAIL_PROVIDER:"gmail",NALBACE_EMAIL_ENABLED:"true",NALBACE_EMAIL_FROM:account,NALBACE_EMAIL_TEST_RECIPIENT:account,NALBACE_EMAIL_MAX_ATTEMPTS:"1"};
  assert.equal(emailConfiguration(base).ready,true);assert.equal(emailConfiguration({...base,NALBACE_EMAIL_TEST_RECIPIENT:"customer@example.test"}).ready,false);assert.equal(emailConfiguration({...base,NALBACE_EMAIL_ENABLED:"false"}).ready,false);
}));
test("Gmail MIME encodes exact subject/body and blocks header injection or extra recipients",()=>{
  const raw=gmailRawMessage(attempt),[headers,...body]=raw.split("\r\n\r\n");
  assert.match(headers,/Content-Type: text\/plain/);assert.doesNotMatch(headers,/\r\nBcc:/);assert.equal(Buffer.from(body.join("\r\n\r\n").replaceAll("\r\n",""),"base64").toString("utf8"),attempt.text);
  for(const changed of [{...attempt,to:"owner@gmail.com\r\nBcc: attacker@example.test"},{...attempt,to:"owner@gmail.com,attacker@example.test"},{...attempt,subject:"Hello\r\nBcc: attacker@example.test"}])assert.throws(()=>gmailRawMessage(changed));
  const longSubject="Résumé ".repeat(20),long=gmailRawMessage({...attempt,subject:longSubject}),words=[...long.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)].map(m=>Buffer.from(m[1],"base64").toString("utf8"));assert.equal(words.join(""),longSubject);assert.ok(long.split("\r\n").every(line=>line.length<998));
});
test("Gmail sends once to a fixed endpoint without automatic retry or provider error disclosure",async()=>{
  let calls=0;const request:typeof fetch=async(url,init)=>{calls++;assert.equal(url,"https://gmail.googleapis.com/gmail/v1/users/me/messages/send");assert.equal(init?.redirect,"error");assert.equal(init?.method,"POST");assert.deepEqual(Object.keys(JSON.parse(String(init?.body))),["raw"]);const raw=Buffer.from(JSON.parse(String(init?.body)).raw,"base64url").toString("utf8");assert.equal(raw,gmailRawMessage(attempt));return Response.json({id:"gmail-message-id"});};
  assert.equal(await submitGmailTestEmail(attempt,"fake-token",request),"gmail-message-id");assert.equal(calls,1);
  let failures=0;const fail:typeof fetch=async()=>{failures++;return new Response("private diagnostic",{status:500});};await assert.rejects(submitGmailTestEmail(attempt,"fake-token",fail),error=>error instanceof Error&&!error.message.includes("private diagnostic"));assert.equal(failures,1);
});
