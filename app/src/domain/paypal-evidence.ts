// Read-only provider evidence, separate from editable sample cases.
export type SandboxInvoice={
  id:string;number:string;status:string;dueDate:string|null;checkedAt:string;
  dueMinor:number|null;currency:"USD"|null;
  payments:{id:string|null;type:"paypal"|"external"|"unknown";amountMinor:number|null}[];
  followUp:"stopped"|"review";reason:string;
  paymentUrl:string|null;
};
function object(value:unknown):Record<string,unknown>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}
export function usdMinor(value:unknown):number|null {
  const money=object(value);
  if(money.currency_code!=="USD"||typeof money.value!=="string"||!/^\d+(\.\d{1,2})?$/.test(money.value))return null;
  const [whole,fraction=""]=money.value.split(".");
  const cents=Number(whole)*100+Number(fraction.padEnd(2,"0"));
  return Number.isSafeInteger(cents)?cents:null;
}
export function normalizeSandboxInvoice(value:unknown,checkedAt:string):SandboxInvoice {
  const raw=object(value),detail=object(raw.detail);
  if(typeof raw.id!=="string"||!/^INV2-[A-Z0-9-]{1,25}$/i.test(raw.id)||typeof raw.status!=="string"||!raw.status||raw.status.length>64)throw new Error("Invalid PayPal invoice evidence.");
  // Never derive due balance from invoice total or status. Unknown money stays unknown.
  const dueMinor=usdMinor(raw.effective_due_amount??raw.due_amount);
  const date=object(detail.payment_term).due_date;
  const dueDate=typeof date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date?date:null;
  const transactions=object(raw.payments).transactions;
  if(transactions!==undefined&&!Array.isArray(transactions))throw new Error("Invalid PayPal payment evidence.");
  const payments=Array.isArray(transactions)?transactions.map(p=>{const record=object(p);return {id:typeof record.payment_id==="string"&&record.payment_id.length>0&&record.payment_id.length<=100?record.payment_id:null,type:record.type==="PAYPAL"?"paypal" as const:record.type==="EXTERNAL"?"external" as const:"unknown" as const,amountMinor:usdMinor(record.amount)};}):[];
  const inactive=["PAID","MARKED_AS_PAID","CANCELLED","REFUNDED","DRAFT","SCHEDULED"].includes(raw.status);
  const stopped=inactive||dueMinor===0;
  const reason=inactive?"This invoice status stops follow-up.":dueMinor===0?"PayPal reports no amount due.":dueMinor===null?"Amount due is unavailable or unsupported. Review required.":"Review client history and offline receipts before considering contact.";
  let paymentUrl:string|null=null;
  const link=object(detail.metadata).recipient_view_url;
  if(typeof link==="string"&&link.length<=2000){try{const url=new URL(link);if(url.protocol==="https:"&&["sandbox.paypal.com","www.sandbox.paypal.com"].includes(url.hostname)&&!url.username&&!url.password&&!url.port&&url.pathname.startsWith("/invoice/"))paymentUrl=url.href;}catch{}}
  return {id:raw.id,number:typeof detail.invoice_number==="string"?detail.invoice_number.slice(0,100):raw.id,status:raw.status,dueDate,checkedAt,dueMinor,currency:dueMinor===null?null:"USD",payments,followUp:stopped?"stopped":"review",reason,paymentUrl};
}
