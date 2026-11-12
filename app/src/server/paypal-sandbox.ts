import "server-only";
import {normalizeSandboxInvoice} from "../domain/paypal-evidence.ts";
const BASE="https://api-m.sandbox.paypal.com";
type Credentials={clientId:string;clientSecret:string};
type Fetcher=typeof fetch;
export class SandboxError extends Error {}
async function json(response:Response):Promise<Record<string,unknown>> {
  try{const value=await response.json();if(value&&typeof value==="object"&&!Array.isArray(value))return value;}catch{}
  throw new SandboxError("PayPal sandbox returned an unreadable response.");
}
async function read(path:string,credentials:Credentials,request:Fetcher) {
  try {
    if(!credentials.clientId||!credentials.clientSecret)throw new SandboxError("PayPal sandbox credentials are required.");
    const auth=await request(`${BASE}/v1/oauth2/token`,{method:"POST",headers:{Authorization:`Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")}`,"Content-Type":"application/x-www-form-urlencoded"},body:"grant_type=client_credentials&ignoreCache=true",cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10000)});
    if(!auth.ok)throw new SandboxError("PayPal sandbox authorization failed.");
    const token=await json(auth);
    if(typeof token.access_token!=="string"||!token.access_token)throw new SandboxError("PayPal sandbox did not return a valid token.");
    const response=await request(`${BASE}${path}`,{headers:{Authorization:`Bearer ${token.access_token}`,Accept:"application/json"},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10000)});
    if(response.status===403)throw new SandboxError("PayPal sandbox invoice access is denied. Check the app's Invoicing permission.");
    if(!response.ok)throw new SandboxError("PayPal sandbox invoice lookup failed.");
    return await json(response);
  }catch(error){if(error instanceof SandboxError)throw error;throw new SandboxError("PayPal sandbox could not be reached. Try refreshing again.");}
}
// Read-only: no live-host switch, send, refund or mark-paid operations.
export async function readSandboxInvoice(invoiceId:string,credentials:Credentials,request:Fetcher=fetch):Promise<{id:string;status:string;raw:Record<string,unknown>;checkedAt:string}> {
  if(!/^INV2-[A-Z0-9-]{1,25}$/i.test(invoiceId))throw new SandboxError("A valid PayPal invoice ID is required.");
  const raw=await read(`/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}`,credentials,request);
  if(raw.id!==invoiceId||typeof raw.status!=="string")throw new SandboxError("PayPal sandbox returned unexpected invoice evidence.");
  return {id:raw.id,status:raw.status,raw,checkedAt:new Date().toISOString()};
}
export async function listSandboxInvoices(credentials:Credentials,request:Fetcher=fetch) {
  const raw=await read("/v2/invoicing/invoices?page=1&page_size=20&total_required=true",credentials,request);
  if((raw.items!==undefined&&!Array.isArray(raw.items))||(raw.items===undefined&&raw.total_items!==0))throw new SandboxError("PayPal sandbox returned an invalid invoice list.");
  const items=(raw.items??[]) as unknown[];
  if(items.length>20)throw new SandboxError("PayPal sandbox returned an invalid invoice list.");
  const checkedAt=new Date().toISOString();
  const invoices=items.map(item=>normalizeSandboxInvoice(item,checkedAt));
  if(new Set(invoices.map(i=>i.id)).size!==invoices.length)throw new SandboxError("PayPal sandbox returned duplicate invoice identities.");
  const total=typeof raw.total_items==="number"&&Number.isSafeInteger(raw.total_items)&&raw.total_items>=invoices.length?raw.total_items:null;
  return {checkedAt,invoices,total,hasMore:total===null?items.length===20:total>items.length};
}
