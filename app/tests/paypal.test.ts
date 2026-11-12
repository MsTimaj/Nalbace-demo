import test from "node:test";
import assert from "node:assert/strict";
import {readSandboxInvoice,listSandboxInvoices} from "../src/server/paypal-sandbox.ts";
import {normalizeSandboxInvoice,usdMinor} from "../src/domain/paypal-evidence.ts";
import {requireLocalRequest} from "../src/server/local-request.ts";
const credentials={clientId:"synthetic-client",clientSecret:"synthetic-secret"};
test("sandbox adapter uses only the sandbox host and verifies resource identity",async()=>{
  const urls:string[]=[];
  const request:typeof fetch=async(input)=>{const url=String(input);urls.push(url);return Response.json(url.endsWith("/token")?{access_token:"synthetic-token"}:{id:"INV2-TEST-123",status:"UNPAID"});};
  const result=await readSandboxInvoice("INV2-TEST-123",credentials,request);
  assert.equal(result.status,"UNPAID");assert.equal(urls.length,2);assert.ok(urls.every(u=>new URL(u).hostname==="api-m.sandbox.paypal.com"));
});
test("list refresh requests fresh permissions and never follows provider links",async()=>{
  const requests:{url:string;method:string;body:unknown;redirect:unknown}[]=[];
  const request:typeof fetch=async(input,init)=>{
    requests.push({url:String(input),method:init?.method??"GET",body:init?.body,redirect:init?.redirect});
    return Response.json(String(input).endsWith('/token')?{access_token:'t'}:{items:[{id:'INV2-TEST',status:'UNPAID',due_amount:{currency_code:'USD',value:'10.25'}}],total_items:21,links:[{rel:'next',href:'https://unsafe.example'}]});
  };
  const result=await listSandboxInvoices(credentials,request);
  assert.equal(result.invoices[0].dueMinor,1025);assert.equal(result.hasMore,true);
  assert.equal(requests.length,2);assert.match(String(requests[0].body),/ignoreCache=true/);
  assert.equal(requests[1].method,'GET');assert.ok(requests.every(r=>r.redirect==='error'));
});
test("empty account is distinct from malformed or duplicate provider evidence",async()=>{
  function transport(data:unknown):typeof fetch{return async input=>Response.json(String(input).endsWith('/token')?{access_token:'t'}:data);}
  assert.equal((await listSandboxInvoices(credentials,transport({total_items:0}))).invoices.length,0);
  for(const raw of [{},{items:{}},{items:[{id:'INV2-TEST',status:'PAID'},{id:'INV2-TEST',status:'PAID'}]}])await assert.rejects(listSandboxInvoices(credentials,transport(raw)));
});
test("network and invalid JSON errors cannot leak diagnostics",async()=>{
  const network:typeof fetch=async()=>{throw new Error('synthetic confidential diagnostic');};
  await assert.rejects(listSandboxInvoices(credentials,network),/could not be reached/);
  const invalid:typeof fetch=async()=>new Response('synthetic confidential diagnostic');
  await assert.rejects(listSandboxInvoices(credentials,invalid),/unreadable response/);
});
test("money remains exact and unsupported or missing balances never become guessed debt",()=>{
  assert.equal(usdMinor({currency_code:'USD',value:'0.29'}),29);
  for(const value of ['-1.00','1.001','1e3','99999999999999999999'])assert.equal(usdMinor({currency_code:'USD',value}),null);
  assert.equal(usdMinor({currency_code:'JPY',value:'100'}),null);
  const invoice=normalizeSandboxInvoice({id:'INV2-TEST',status:'UNPAID',amount:{currency_code:'USD',value:'500'}},new Date().toISOString());
  assert.equal(invoice.dueMinor,null);assert.equal(invoice.followUp,'review');
});
test("closed and zero-due invoices stop pursuit; external payments retain their provenance",()=>{
  for(const status of ['PAID','MARKED_AS_PAID','CANCELLED','REFUNDED','DRAFT','SCHEDULED'])assert.equal(normalizeSandboxInvoice({id:'INV2-TEST',status},'2026-10-24T12:00:00Z').followUp,'stopped');
  const invoice=normalizeSandboxInvoice({id:'INV2-TEST',status:'UNPAID',due_amount:{currency_code:'USD',value:'0.00'},payments:{transactions:[{type:'EXTERNAL',amount:{currency_code:'USD',value:'10.00'}},{type:'PAYPAL',amount:{currency_code:'USD',value:'15.00'}},{type:'NEW_TYPE'}]}},'2026-10-24T12:00:00Z');
  assert.equal(invoice.followUp,'stopped');assert.deepEqual(invoice.payments.map(p=>p.type),['external','paypal','unknown']);
});
test("sandbox reads reject foreign hosts and origins before accessing credentials",()=>{
  const request=(host:string,origin?:string)=>new Request('http://127.0.0.1:3000/api/paypal-sandbox',{headers:{host,...(origin?{origin}:{})}});
  assert.doesNotThrow(()=>requireLocalRequest(request('127.0.0.1:3000','http://127.0.0.1:3000'),true));
  assert.throws(()=>requireLocalRequest(request('attacker.example','http://127.0.0.1:3000'),true));
  assert.throws(()=>requireLocalRequest(request('127.0.0.1:3000','https://attacker.example'),true));
  assert.throws(()=>requireLocalRequest(request('127.0.0.1:3000'),true));
});
test("missing credentials and malicious invoice paths fail before any request",async()=>{
  let requests=0;const request:typeof fetch=async()=>{requests++;throw new Error("Unexpected request");};
  await assert.rejects(readSandboxInvoice("../../other",credentials,request));
  await assert.rejects(readSandboxInvoice("INV2-TEST",{clientId:"",clientSecret:""},request));assert.equal(requests,0);
});
test("only sandbox PayPal invoice URLs can be exposed as test payment links",()=>{
  const invoice=(url:string)=>normalizeSandboxInvoice({id:"INV2-TEST",status:"UNPAID",detail:{metadata:{recipient_view_url:url}}},new Date().toISOString());
  const safe="https://www.sandbox.paypal.com/invoice/p/#TEST";
  assert.equal(invoice(safe).paymentUrl,safe);
  for(const url of ['https://www.paypal.com/invoice/p/#TEST','https://sandbox.paypal.com.evil.example/invoice/p/','javascript:alert(1)','https://user:pass@sandbox.paypal.com/invoice/p/','https://sandbox.paypal.com:444/invoice/p/','https://sandbox.paypal.com/login'])assert.equal(invoice(url).paymentUrl,null);
});
test("provider errors are sanitized and a wrong invoice response is rejected",async()=>{
  const failed:typeof fetch=async()=>new Response("secret provider diagnostic",{status:401});
  await assert.rejects(readSandboxInvoice("INV2-TEST",credentials,failed),e=>e instanceof Error&&e.message==="PayPal sandbox authorization failed.");
  let n=0;const swapped:typeof fetch=async()=>Response.json(n++===0?{access_token:"t"}:{id:"INV2-OTHER",status:"PAID"});
  await assert.rejects(readSandboxInvoice("INV2-TEST",credentials,swapped),/unexpected invoice evidence/);
});
