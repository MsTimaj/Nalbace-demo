import "server-only";
import {DatabaseSync} from "node:sqlite";
import {mkdirSync} from "node:fs";
import path from "node:path";
function db(){const dir=path.join(process.cwd(),".data");mkdirSync(dir,{recursive:true});const d=new DatabaseSync(path.join(dir,"voice-supervisor.sqlite"));d.exec("PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS supervisor(approval TEXT PRIMARY KEY, token TEXT NOT NULL, binding TEXT NOT NULL, heartbeat INTEGER NOT NULL, expires INTEGER NOT NULL)");return d;}
export function heartbeatVoiceSupervisor(approval:string,token:string,binding:string,now=Date.now()){
 if(!/^[A-Za-z0-9-]{1,100}$/.test(approval)||!/^[a-f0-9]{32}$/.test(token)||!/^[a-f0-9]{64}$/.test(binding)||!Number.isFinite(now))throw new Error("Invalid voice supervision binding.");
 const d=db();try{d.exec("BEGIN IMMEDIATE");const row=d.prepare("SELECT * FROM supervisor WHERE approval=?").get(approval) as {token:string;expires:number}|undefined;
 if(row&&row.token!==token&&row.expires>now)throw new Error("Another supervisor owns this test.");
 d.prepare("INSERT INTO supervisor VALUES(?,?,?,?,?) ON CONFLICT(approval) DO UPDATE SET token=excluded.token,binding=excluded.binding,heartbeat=excluded.heartbeat,expires=excluded.expires").run(approval,token,binding,now,now+6000);d.exec("COMMIT");}catch(e){d.exec("ROLLBACK");throw e;}finally{d.close();}
}
export function requireVoiceSupervisor(approval:string,binding:string,now=Date.now()){
 const d=db();try{const row=d.prepare("SELECT * FROM supervisor WHERE approval=?").get(approval) as {binding:string;heartbeat:number;expires:number}|undefined;if(!row||row.binding!==binding||now<row.heartbeat||now-row.heartbeat>5000||row.expires<=now)throw new Error("The independent call supervisor is not ready. No call can start.");}finally{d.close();}
}
export function releaseVoiceSupervisor(approval:string,token:string){const d=db();try{d.prepare("DELETE FROM supervisor WHERE approval=? AND token=?").run(approval,token);}finally{d.close();}}
