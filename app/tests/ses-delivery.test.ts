import test from "node:test";
import assert from "node:assert/strict";
import {Readable} from "node:stream";
import {createHash} from "node:crypto";
import {mkdtempSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {sesConnection,sesClientConfiguration,submitSesTestEmail,safeSesDiagnostic,SesDeliveryError,SES_CONFIGURATION_SET} from "../src/server/ses-delivery.ts";
import {emailConfiguration,deliverApprovedTestEmail} from "../src/server/email-delivery.ts";
import {readWorkspace,saveSandboxImport,saveContactPermission,prepareDraft,approveDraft,recordCustomerUpdate} from "../src/server/store.ts";
import {normalizeSandboxInvoice} from "../src/domain/paypal-evidence.ts";
import type {EmailAttempt} from "../src/domain/email-delivery.ts";
const credentials={NALBACE_SES_ACCESS_KEY_ID:"AKID0000000000000000ST",NALBACE_SES_SECRET_ACCESS_KEY:"synthetic-secret-for-offline-tests-only"};
const connection=sesConnection(credentials)!;
const attempt:EmailAttempt={id:"ses-offline-1",caseId:"case",draftId:"draft",approvalId:"approval",at:new Date().toISOString(),from:"demo@mail.example.test",to:"owner@example.test",subject:"Exact subject",text:"Exact body £25",state:"reserved"};

test("SES pins one explicit reply mailbox and rejects header injection before dispatch",async()=>{
 let calls=0;const handler={handle:async(request:{body?:unknown})=>{calls++;const raw=request.body instanceof Uint8Array?Buffer.from(request.body).toString("utf8"):String(request.body);assert.deepEqual(JSON.parse(raw).ReplyToAddresses,["replies@example.test"]);return {response:{statusCode:200,headers:{"content-type":"application/json"},body:Readable.from([JSON.stringify({MessageId:"reply-header-test"})])}};}};
 await submitSesTestEmail({...attempt,replyTo:"replies@example.test"},connection,handler);
 await assert.rejects(submitSesTestEmail({...attempt,replyTo:"replies@example.test\r\nBcc: other@example.test"},connection,handler));assert.equal(calls,1);
 const env={...credentials,NALBACE_EMAIL_ENABLED:"true",NALBACE_EMAIL_PROVIDER:"ses",NALBACE_EMAIL_MAX_ATTEMPTS:"1",NALBACE_EMAIL_FROM:attempt.from,NALBACE_EMAIL_TEST_RECIPIENT:attempt.to};assert.equal(emailConfiguration(env).ready,false);assert.equal(emailConfiguration({...env,NALBACE_EMAIL_REPLY_TO:"replies@example.test"}).ready,true);
});

test("SES requires dedicated credentials and explicit bounded gates; credential changes alter binding",()=>{
  assert.equal(sesConnection({AWS_ACCESS_KEY_ID:credentials.NALBACE_SES_ACCESS_KEY_ID,AWS_SECRET_ACCESS_KEY:credentials.NALBACE_SES_SECRET_ACCESS_KEY}),null);
  assert.equal(sesConnection({...credentials,NALBACE_SES_SECRET_ACCESS_KEY:"bad\r\nsecret"}),null);
  assert.notEqual(sesConnection({...credentials,NALBACE_SES_SESSION_TOKEN:"different-session"})!.binding,connection.binding);
  assert.notEqual(sesConnection({...credentials,NALBACE_SES_SECRET_ACCESS_KEY:"another-synthetic-secret-only"})!.binding,connection.binding);
  const settings={...credentials,NALBACE_EMAIL_REPLY_TO:"owner@example.test",NALBACE_EMAIL_PROVIDER:"ses",NALBACE_EMAIL_ENABLED:"true",NALBACE_EMAIL_MAX_ATTEMPTS:"1",NALBACE_EMAIL_FROM:attempt.from,NALBACE_EMAIL_TEST_RECIPIENT:attempt.to};
  assert.equal(emailConfiguration(settings).ready,true);
  for(const change of [{NALBACE_EMAIL_ENABLED:"false"},{NALBACE_EMAIL_MAX_ATTEMPTS:"0"},{NALBACE_EMAIL_MAX_ATTEMPTS:"4"},{NALBACE_SES_ACCESS_KEY_ID:""},{NALBACE_EMAIL_TEST_RECIPIENT:""}])assert.equal(emailConfiguration({...settings,...change}).ready,false);
  assert.equal(sesClientConfiguration(connection).maxAttempts,1);
});

test("SES signs one exact text-only request to fixed Ohio endpoint and ignores ambient endpoint configuration",async()=>{
  const old=process.env.AWS_ENDPOINT_URL_SES_V2;process.env.AWS_ENDPOINT_URL_SES_V2="https://invalid.example.test";
  let calls=0;
  try{
    const id=await submitSesTestEmail(attempt,connection,{handle:async(request:{hostname:string;protocol:string;method:string;headers:Record<string,string>;body?:unknown})=>{
      calls++;assert.equal(request.hostname,"email.us-east-2.amazonaws.com");assert.equal(request.protocol,"https:");assert.equal(request.method,"POST");
      assert.match(request.headers.authorization,/AWS4-HMAC-SHA256/);assert.match(request.headers.authorization,/us-east-2\/ses\/aws4_request/);
      const body=request.body instanceof Uint8Array?Buffer.from(request.body).toString("utf8"):String(request.body);
      assert.equal(SES_CONFIGURATION_SET,"my-first-configuration-set");
      assert.deepEqual(JSON.parse(body),{ConfigurationSetName:"my-first-configuration-set",FromEmailAddress:attempt.from,Destination:{ToAddresses:[attempt.to]},Content:{Simple:{Subject:{Data:attempt.subject,Charset:"UTF-8"},Body:{Text:{Data:attempt.text,Charset:"UTF-8"}}}}});
      return {response:{statusCode:200,headers:{"content-type":"application/json"},body:Readable.from([JSON.stringify({MessageId:"ses-accepted-1"})])}};
    }});
    assert.equal(id,"ses-accepted-1");assert.equal(calls,1);
  }finally{if(old===undefined)delete process.env.AWS_ENDPOINT_URL_SES_V2;else process.env.AWS_ENDPOINT_URL_SES_V2=old;}
});

test("SES throttling, server failure, timeouts and malformed acceptance never retry or expose diagnostics",async()=>{
  for(const statusCode of [429,500,200]){
    let calls=0;
    await assert.rejects(submitSesTestEmail(attempt,connection,{handle:async()=>{calls++;return {response:{statusCode,headers:{"content-type":"application/json"},body:Readable.from([JSON.stringify({message:"private provider diagnostics"})])}};}}),/^Error: SES acceptance could not be confirmed\.$/);
    assert.equal(calls,1);
  }
  let calls=0;await assert.rejects(submitSesTestEmail(attempt,connection,{handle:async()=>{calls++;throw Object.assign(new Error("private credentials"),{name:"TimeoutError"});}}),/SES acceptance could not be confirmed/);assert.equal(calls,1);
});

test("SES rejects header injection before any request",async()=>{
  let calls=0;await assert.rejects(submitSesTestEmail({...attempt,subject:"Hello\r\nBcc: another@example.test"},connection,{handle:async()=>{calls++;throw new Error();}}),/headers/);assert.equal(calls,0);
});

test("SES diagnostic records only bounded categories/status/request references and strips raw secrets",async()=>{
  const diagnostic=safeSesDiagnostic({name:"AccessDeniedException",message:"private secret key and body",stack:"secret",headers:{authorization:"secret"},$metadata:{httpStatusCode:403,requestId:"11111111-2222-3333-4444-555555555555"}});
  assert.deepEqual(diagnostic,{category:"access-denied",httpStatus:403,requestId:"11111111-2222-3333-4444-555555555555"});
  assert.deepEqual(safeSesDiagnostic({name:"TimeoutError",$metadata:{httpStatusCode:999,requestId:"arbitrary private text"}}),{category:"timeout"});
  assert.deepEqual(safeSesDiagnostic({name:"MessageRejected",message:"untrusted provider explanation"}),{category:"rejected"});
  await assert.rejects(submitSesTestEmail(attempt,connection,{handle:async()=>{throw Object.assign(new Error("private data"),{name:"TimeoutError"});}}),e=>e instanceof SesDeliveryError&&e.diagnostic.category==="timeout"&&!e.message.includes("private"));
});

test("SES dispatch blocks credential rotation, stop/payment races and zero spending after fresh offline PayPal reads",async()=>{
  for(const scenario of ["credentials","stop","payment","budget"]){
    const directory=process.cwd(),originalFetch=globalThis.fetch;
    const settings={...credentials,NALBACE_EMAIL_REPLY_TO:"owner@example.test",NALBACE_EMAIL_PROVIDER:"ses",NALBACE_EMAIL_ENABLED:"true",NALBACE_EMAIL_MAX_ATTEMPTS:"1",NALBACE_EMAIL_FROM:attempt.from,NALBACE_EMAIL_TEST_RECIPIENT:attempt.to,PAYPAL_SANDBOX_CLIENT_ID:"fake-paypal-client",PAYPAL_SANDBOX_CLIENT_SECRET:"fake-paypal-secret",NALBACE_SPEND_ENABLED:"false"};
    const previous=Object.fromEntries(Object.keys(settings).map(k=>[k,process.env[k]]));
    process.chdir(mkdtempSync(path.join(os.tmpdir(),"nalbace-ses-gates-")));Object.assign(process.env,settings);
    let calls=0;
    try{
      const raw={id:"INV2-SES-OFFLINE",status:"UNPAID",detail:{invoice_number:"SES-OFFLINE",payment_term:{due_date:"2026-01-01"}},due_amount:{currency_code:"USD",value:"25.00"}};
      saveSandboxImport(normalizeSandboxInvoice(raw,new Date().toISOString()),createHash("sha256").update(settings.PAYPAL_SANDBOX_CLIENT_ID).digest("hex"));
      const c=readWorkspace().cases.find(c=>c.id==="sandbox-test")!;
      saveContactPermission(c.id,c.version,{email:attempt.to,verified:true,emailAllowed:true,voiceAllowed:false,phone:"",note:"Own test inbox",evidence:{basis:"self-test",wording:"I agree to one synthetic reminder to my own mailbox.",capturedAt:new Date().toISOString(),reference:"Offline fixture"}});
      const draft=prepareDraft(c.id),approval=approveDraft(c.id,draft.id,draft.subject,draft.body);
      globalThis.fetch=async(url)=>{
        calls++;assert.match(String(url),/^https:\/\/api-m\.sandbox\.paypal\.com\//);
        if(String(url).endsWith("/v1/oauth2/token"))return Response.json({access_token:"fake-token"});
        if(scenario==="credentials")process.env.NALBACE_SES_SECRET_ACCESS_KEY="rotated-synthetic-secret-key";
        if(scenario==="stop")recordCustomerUpdate(c.id,"stop","Stop now",null,"ses-stop");
        return Response.json(scenario==="payment"?{...raw,status:"PAID",due_amount:{currency_code:"USD",value:"0.00"}}:raw);
      };
      await assert.rejects(deliverApprovedTestEmail(c.id,draft.id,approval.id),scenario==="credentials"?/configuration changed/:scenario==="stop"?/case changed/:scenario==="payment"?/changed PayPal/:/spending controls/);
      assert.equal(calls,2);
      const workspace=readWorkspace();assert.equal(workspace.emailAttempts?.length??0,scenario==="budget"?1:0);
      if(scenario==="budget"){
        assert.equal(workspace.emailAttempts![0].state,"blocked");assert.equal(workspace.emailAttempts![0].deliveryProvider,"ses");
        assert.equal((await deliverApprovedTestEmail(c.id,draft.id,approval.id)).state,"blocked");assert.equal(calls,2);
      }
      if(scenario==="payment")assert.equal(workspace.cases.find(item=>item.id===c.id)!.invoices[0].balanceMinor,0);
    }finally{globalThis.fetch=originalFetch;process.chdir(directory);for(const [k,v] of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
  }
});
