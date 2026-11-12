import "server-only";
import type {EmailAttempt} from "../domain/email-delivery.ts";
import {simpleEmail} from "../domain/email-delivery.ts";
export function gmailRawMessage(attempt:EmailAttempt){
  if((attempt.replyTo!==undefined&&!simpleEmail(attempt.replyTo))||!simpleEmail(attempt.from)||!simpleEmail(attempt.to)||!attempt.subject.trim()||attempt.subject.length>200||/[\r\n]/.test(attempt.subject)||attempt.text.length>6000||!/^[a-zA-Z0-9-]{1,100}$/.test(attempt.id))throw new Error("Review exact email headers before delivery.");
  const chunks:string[]=[];let chunk="";
  for(const point of attempt.subject){if(Buffer.byteLength(chunk+point,"utf8")>42){chunks.push(chunk);chunk="";}chunk+=point;}if(chunk)chunks.push(chunk);
  const subject=chunks.map(part=>`=?UTF-8?B?${Buffer.from(part,"utf8").toString("base64")}?=`).join("\r\n "),body=Buffer.from(attempt.text,"utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n")??"";
  // No model-provided headers, Cc/Bcc, attachments, HTML or extra recipients.
  return [`From: ${attempt.from}`,`To: ${attempt.to}`,...(attempt.replyTo?[`Reply-To: ${attempt.replyTo}`]:[]),`Subject: ${subject}`,`Message-ID: <nalbace-${attempt.id}@nalbace.local>`,"MIME-Version: 1.0","Content-Type: text/plain; charset=UTF-8","Content-Transfer-Encoding: base64","",body].join("\r\n");
}
export async function submitGmailTestEmail(attempt:EmailAttempt,token:string,request:typeof fetch=fetch){
  const raw=Buffer.from(gmailRawMessage(attempt),"utf8").toString("base64url");
  const response=await request("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",{method:"POST",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({raw})});
  if(!response.ok)throw new Error("Gmail acceptance could not be confirmed.");
  const value=await response.json();if(!value||typeof value.id!=="string"||!/^[a-zA-Z0-9-]{1,100}$/.test(value.id))throw new Error("Gmail acceptance could not be confirmed.");return value.id as string;
}
