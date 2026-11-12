import "server-only";
import {createHash} from "node:crypto";
import {readWorkspace,finishEvidenceRefresh,recordVoicePaymentCheck} from "./store.ts";
import {readSandboxInvoice} from "./paypal-sandbox.ts";
import {normalizeSandboxInvoice} from "../domain/paypal-evidence.ts";
// Read-only PayPal sampling during the supervised call. No automatic send or
// payment mutation; changed evidence invalidates approval and triggers a stop.
export async function checkVoicePayments(id:string,request:typeof fetch=fetch){
 const w=readWorkspace(),call=w.voiceCalls?.find(c=>c.id===id),c=w.cases.find(c=>c.id===call?.caseId);
 if(!call||!c||c.source!=="paypal-sandbox")throw new Error("Review the voice payment binding.");
 const clientId=process.env.PAYPAL_SANDBOX_CLIENT_ID??"",clientSecret=process.env.PAYPAL_SANDBOX_CLIENT_SECRET??"";
 if(!clientSecret||createHash("sha256").update(clientId).digest("hex")!==c.providerBinding)throw new Error("Review the voice payment provider.");
 const evidence=[];let changed=false;
 for(const invoice of c.invoices){const fresh=await readSandboxInvoice(invoice.id,{clientId,clientSecret},request),e=normalizeSandboxInvoice(fresh.raw,fresh.checkedAt),old=invoice.evidence;evidence.push(e);if(!old||e.status!==old.status||e.dueMinor!==old.dueMinor||e.currency!==old.currency||e.dueDate!==old.dueDate||e.followUp!==old.followUp||JSON.stringify(e.payments)!==JSON.stringify(old.payments))changed=true;}
 if(changed)finishEvidenceRefresh(c.id,c.version,evidence);
 else recordVoicePaymentCheck(call.id,c.version,c.providerBinding!,evidence.map(e=>e.checkedAt).sort()[0]);
 return {changed};
}
