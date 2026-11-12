import "server-only";
import {DatabaseSync} from "node:sqlite";
import {mkdirSync,existsSync} from "node:fs";
import path from "node:path";
import {randomBytes,createCipheriv,createDecipheriv,createHash} from "node:crypto";
import {simpleEmail} from "../domain/email-delivery.ts";
export const gmailRedirect="http://127.0.0.1:3000/api/gmail-connection/callback";
export const gmailSendScope="https://www.googleapis.com/auth/gmail.send";
export function gmailConfiguration(env:Record<string,string|undefined>=process.env){
  const clientId=env.NALBACE_GMAIL_CLIENT_ID??"",clientSecret=env.NALBACE_GMAIL_CLIENT_SECRET??"",expectedEmail=env.NALBACE_GMAIL_ACCOUNT??"",key=env.NALBACE_GMAIL_STORAGE_KEY??"";
  const setupReady=clientId.endsWith(".apps.googleusercontent.com")&&Boolean(clientSecret.trim())&&simpleEmail(expectedEmail)&&expectedEmail.toLowerCase().endsWith("@gmail.com")&&/^[A-Za-z0-9+/]{43}=$/.test(key)&&Buffer.from(key,"base64").length===32;
  const binding=createHash("sha256").update(JSON.stringify([clientId,expectedEmail.toLowerCase(),gmailRedirect])).digest("hex");
  return {setupReady,clientId,clientSecret,expectedEmail,key,binding};
}
export function sealGmailSecret(value:unknown,key:string){
  const nonce=randomBytes(12),cipher=createCipheriv("aes-256-gcm",Buffer.from(key,"base64"),nonce);cipher.setAAD(Buffer.from("nalbace-gmail-v1"));
  const body=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]);
  return [nonce,cipher.getAuthTag(),body].map(b=>b.toString("base64url")).join(".");
}
export function openGmailSecret<T>(sealed:string,key:string):T{
  const parts=sealed.split(".");if(parts.length!==3)throw new Error("Review Gmail connection storage.");
  const [nonce,tag,body]=parts.map(p=>Buffer.from(p,"base64url"));
  const decipher=createDecipheriv("aes-256-gcm",Buffer.from(key,"base64"),nonce);decipher.setAAD(Buffer.from("nalbace-gmail-v1"));decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(body),decipher.final()]).toString("utf8")) as T;
}
export type GmailConnection={id:string;email:string;subject:string;binding:string;refreshToken:string;accessToken:string;expiresAt:number};
type Pending={stateHash:string;verifier:string;expiresAt:number;binding:string};
function location(){return path.join(process.cwd(),".data","gmail-auth.sqlite");}
function database(){
  mkdirSync(path.dirname(location()),{recursive:true});const db=new DatabaseSync(location());
  db.exec("PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS gmail_secret (id TEXT PRIMARY KEY,payload TEXT NOT NULL);");return db;
}
function put(id:string,value:unknown){const config=gmailConfiguration();if(!config.setupReady)throw new Error("Review Gmail setup first.");const db=database();try{db.prepare("INSERT OR REPLACE INTO gmail_secret(id,payload) VALUES (?,?)").run(id,sealGmailSecret(value,config.key));}finally{db.close();}}
export function savePendingGmail(value:Pending){put("pending",value);}
export function consumePendingGmail(state:string):Pending{
  const config=gmailConfiguration();if(!config.setupReady)throw new Error("Review Gmail setup first.");
  const db=database();db.exec("BEGIN IMMEDIATE");
  try{
    const row=db.prepare("SELECT payload FROM gmail_secret WHERE id='pending'").get() as {payload:string}|undefined;
    if(!row)throw new Error("Review Gmail connection: start again.");const pending=openGmailSecret<Pending>(row.payload,config.key);
    if(pending.stateHash!==createHash("sha256").update(state).digest("hex")||pending.expiresAt<=Date.now()||pending.binding!==config.binding)throw new Error("Review Gmail connection: this sign-in expired or changed.");
    db.prepare("DELETE FROM gmail_secret WHERE id='pending'").run();db.exec("COMMIT");return pending;
  }catch(error){db.exec("ROLLBACK");throw error;}finally{db.close();}
}
export function saveGmailConnection(value:GmailConnection){
  if(value.binding!==gmailConfiguration().binding||!value.refreshToken||!value.accessToken||!Number.isFinite(value.expiresAt))throw new Error("Review Gmail connection credentials.");put("connection",value);
}
export function readGmailConnection():GmailConnection|null{
  const config=gmailConfiguration();if(!config.setupReady||!existsSync(location()))return null;
  const db=database();try{
    const row=db.prepare("SELECT payload FROM gmail_secret WHERE id='connection'").get() as {payload:string}|undefined;if(!row)return null;
    const c=openGmailSecret<GmailConnection>(row.payload,config.key);
    if(c.binding!==config.binding||c.email.toLowerCase()!==config.expectedEmail.toLowerCase()||!c.refreshToken||!c.accessToken||!Number.isFinite(c.expiresAt))return null;
    return c;
  }catch{return null;}finally{db.close();}
}
export function clearGmailConnection(){if(!existsSync(location()))return;const db=database();try{db.prepare("DELETE FROM gmail_secret").run();}finally{db.close();}}
