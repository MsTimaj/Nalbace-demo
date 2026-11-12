import "server-only";
import {DatabaseSync} from "node:sqlite";
import {mkdirSync} from "node:fs";
import path from "node:path";
import {inboxAccess} from "./gmail-inbox-connection.ts";
import {inboxConfiguration,readInboxConnection} from "./gmail-inbox-vault.ts";
import {readWorkspace,recordMailboxReply} from "./store.ts";
import {hasSelfTestEmailEvidence} from "../domain/permission-evidence.ts";
import {parseMailboxReply,replyAddress} from "../domain/reply-routing.ts";
export async function readMailboxJson(url:string,token:string,request:typeof fetch=fetch){
 if(!url.startsWith("https://gmail.googleapis.com/gmail/v1/users/me/"))throw new Error("Unexpected mailbox endpoint.");
 const response=await request(url,{method:"GET",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`}});
 if(!response.ok)throw new Error("Mailbox read failed; nothing will be sent or retried.");
 const reader=response.body?.getReader();if(!reader)throw new Error("Empty mailbox response.");let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>350000)throw new Error("Mailbox response exceeds limits.");chunks.push(next.value);}}finally{await reader.cancel().catch(()=>{});}
 return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function reserveInboxCheck(attemptId:string){
 const dir=path.join(process.cwd(),".data");mkdirSync(dir,{recursive:true});const db=new DatabaseSync(path.join(dir,"inbox-checks.sqlite"));db.exec("PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS checks(at INTEGER NOT NULL, attempt TEXT NOT NULL)");db.exec("BEGIN IMMEDIATE");
 try{const now=Date.now(),recent=db.prepare("SELECT count(*) AS n FROM checks WHERE at>?").get(now-86400000) as {n:number},same=db.prepare("SELECT count(*) AS n FROM checks WHERE at>? AND attempt=?").get(now-60000,attemptId) as {n:number};if(recent.n>=10||same.n)throw new Error("Reply checks are limited to ten per day and one per reminder per minute.");db.prepare("INSERT INTO checks(at,attempt) VALUES (?,?)").run(now,attemptId);db.exec("COMMIT");}catch(e){db.exec("ROLLBACK");throw e;}finally{db.close();}
}
// Deliberate pull only. No background inbox scan, mailbox mutation or AI request.
export async function pullReminderReplies(attemptId:string,request:typeof fetch=fetch){
 const deadline=AbortSignal.timeout(30000);const boundedRequest:typeof fetch=(url,init)=>request(url,{...init,signal:AbortSignal.any([deadline,...(init?.signal?[init.signal]:[])])});
 const connection=await inboxAccess(),config=inboxConfiguration(),attempt=readWorkspace().emailAttempts?.find(a=>a.id===attemptId);
 if(!attempt||attempt.state!=="accepted"||!attempt.replyTo||attempt.replyTo!==replyAddress(connection.email,attempt.id))throw new Error("Choose an accepted reminder with the connected reply route.");
 const client=readWorkspace().cases.find(c=>c.id===attempt.caseId),selfTest=attempt.to.toLowerCase()===connection.email.toLowerCase()&&Boolean(client&&hasSelfTestEmailEvidence(client));
 reserveInboxCheck(attemptId);
 const assertConnection=()=>{if(readInboxConnection()?.id!==connection.id||inboxConfiguration().binding!==config.binding)throw new Error("Mailbox connection changed during review.");};
 const profile=await readMailboxJson("https://gmail.googleapis.com/gmail/v1/users/me/profile",connection.token,boundedRequest);
 if(typeof profile.emailAddress!=="string"||profile.emailAddress.toLowerCase()!==connection.email.toLowerCase())throw new Error("Mailbox identity does not match.");
 const q=`to:${attempt.replyTo} from:${attempt.to} ${selfTest?"":"-in:sent "}-in:drafts -in:spam -in:trash`;
 const list=await readMailboxJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=${encodeURIComponent(q)}`,connection.token,boundedRequest);
 if(!Array.isArray(list.messages??[])||(list.messages?.length??0)>5)throw new Error("Unsupported mailbox list.");
 let matched=0,rejected=0;
 for(const entry of list.messages??[]){
  if(!entry||typeof entry.id!=="string"||!/^[a-f0-9]{1,64}$/i.test(entry.id))throw new Error("Invalid mailbox message identity.");
  const raw=await readMailboxJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${entry.id}?format=full`,connection.token,boundedRequest);assertConnection();
  let parsed;try{if(raw.id!==entry.id)throw new Error("Message identity changed.");parsed=parseMailboxReply(raw,attempt.replyTo,attempt.to,selfTest);}catch{rejected++;continue;}
  assertConnection();const result=recordMailboxReply({connectionBinding:config.binding,mailbox:connection.email,messageId:parsed.messageId,alias:parsed.to,from:parsed.from,text:parsed.text});if(result.result==="matched")matched++;else rejected++;
 }
 return {matched,rejected,moreAvailable:Boolean(list.nextPageToken),checked:Math.min(5,list.messages?.length??0)};
}
