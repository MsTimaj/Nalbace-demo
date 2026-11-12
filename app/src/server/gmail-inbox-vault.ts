import "server-only";
import {DatabaseSync} from "node:sqlite";
import {mkdirSync,existsSync} from "node:fs";
import path from "node:path";
import {randomBytes,createCipheriv,createDecipheriv,createHash} from "node:crypto";
import {simpleEmail} from "../domain/email-delivery.ts";
export const inboxRedirect="http://127.0.0.1:3000/api/inbox-connection/callback";
export const inboxReadScope="https://www.googleapis.com/auth/gmail.readonly";
export function inboxConfiguration(env:Record<string,string|undefined>=process.env){
  const clientId=env.NALBACE_INBOX_CLIENT_ID??"",clientSecret=env.NALBACE_INBOX_CLIENT_SECRET??"",expectedEmail=env.NALBACE_INBOX_ACCOUNT??"",key=env.NALBACE_INBOX_STORAGE_KEY??"";
  const setupReady=clientId!==env.NALBACE_GMAIL_CLIENT_ID&&clientId.endsWith(".apps.googleusercontent.com")&&Boolean(clientSecret.trim())&&simpleEmail(expectedEmail)&&expectedEmail.toLowerCase().endsWith("@gmail.com")&&/^[A-Za-z0-9+/]{43}=$/.test(key)&&Buffer.from(key,"base64").length===32;
  const binding=createHash("sha256").update(JSON.stringify([clientId,expectedEmail.toLowerCase(),inboxRedirect])).digest("hex");
  return {setupReady,clientId,clientSecret,expectedEmail,key,binding};
}
export function sealInboxSecret(value:unknown,key:string){
  const nonce=randomBytes(12),cipher=createCipheriv("aes-256-gcm",Buffer.from(key,"base64"),nonce);cipher.setAAD(Buffer.from("nalbace-inbox-v1"));
  const body=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]);
  return [nonce,cipher.getAuthTag(),body].map(b=>b.toString("base64url")).join(".");
}
export function openInboxSecret<T>(sealed:string,key:string):T{
  const parts=sealed.split(".");if(parts.length!==3)throw new Error("Review Inbox connection storage.");
  const [nonce,tag,body]=parts.map(p=>Buffer.from(p,"base64url"));
  const decipher=createDecipheriv("aes-256-gcm",Buffer.from(key,"base64"),nonce);decipher.setAAD(Buffer.from("nalbace-inbox-v1"));decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(body),decipher.final()]).toString("utf8")) as T;
}
export type InboxConnection={id:string;email:string;subject:string;binding:string;refreshToken:string;accessToken:string;expiresAt:number};
type Pending={stateHash:string;verifier:string;expiresAt:number;binding:string};
function location(){return path.join(process.cwd(),".data","inbox-auth.sqlite");}
function database(){
  mkdirSync(path.dirname(location()),{recursive:true});const db=new DatabaseSync(location());
  db.exec("PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS inbox_secret (id TEXT PRIMARY KEY,payload TEXT NOT NULL);");return db;
}
function put(id:string,value:unknown){const config=inboxConfiguration();if(!config.setupReady)throw new Error("Review Inbox setup first.");const db=database();try{db.prepare("INSERT OR REPLACE INTO inbox_secret(id,payload) VALUES (?,?)").run(id,sealInboxSecret(value,config.key));}finally{db.close();}}
export function savePendingInbox(value:Pending){put("pending",value);}
export function consumePendingInbox(state:string):Pending{
  const config=inboxConfiguration();if(!config.setupReady)throw new Error("Review Inbox setup first.");
  const db=database();db.exec("BEGIN IMMEDIATE");
  try{
    const row=db.prepare("SELECT payload FROM inbox_secret WHERE id='pending'").get() as {payload:string}|undefined;
    if(!row)throw new Error("Review Inbox connection: start again.");const pending=openInboxSecret<Pending>(row.payload,config.key);
    if(pending.stateHash!==createHash("sha256").update(state).digest("hex")||pending.expiresAt<=Date.now()||pending.binding!==config.binding)throw new Error("Review Inbox connection: this sign-in expired or changed.");
    db.prepare("DELETE FROM inbox_secret WHERE id='pending'").run();db.exec("COMMIT");return pending;
  }catch(error){db.exec("ROLLBACK");throw error;}finally{db.close();}
}
export function saveInboxConnection(value:InboxConnection){
  if(value.binding!==inboxConfiguration().binding||!value.refreshToken||!value.accessToken||!Number.isFinite(value.expiresAt))throw new Error("Review Inbox connection credentials.");put("connection",value);
}
export function readInboxConnection():InboxConnection|null{
  const config=inboxConfiguration();if(!config.setupReady||!existsSync(location()))return null;
  const db=database();try{
    const row=db.prepare("SELECT payload FROM inbox_secret WHERE id='connection'").get() as {payload:string}|undefined;if(!row)return null;
    const c=openInboxSecret<InboxConnection>(row.payload,config.key);
    if(c.binding!==config.binding||c.email.toLowerCase()!==config.expectedEmail.toLowerCase()||!c.refreshToken||!c.accessToken||!Number.isFinite(c.expiresAt))return null;
    return c;
  }catch{return null;}finally{db.close();}
}
export function clearInboxConnection(){if(!existsSync(location()))return;const db=database();try{db.prepare("DELETE FROM inbox_secret").run();}finally{db.close();}}
