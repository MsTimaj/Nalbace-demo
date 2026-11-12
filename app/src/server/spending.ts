import "server-only";
import {DatabaseSync} from "node:sqlite";
import {mkdirSync} from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
export type SpendService="ai"|"email"|"voice";
export type SpendPolicy={enabled:boolean;rateCard:string;validUntil:string;applicationMicroUsd:number;merchantMicroUsd:number;aiRequests:number;emailAttempts:number;voiceSeconds:number;aiMaxMicroUsd:number;emailMaxMicroUsd:number;voiceMaxMicroUsd:number;aiModel:string;emailProvider:string;voiceProvider:string};
export type SpendReservation={id:string;merchant:string;service:SpendService;period:string;reservedMicroUsd:number;units:number;state:"reserved"|"committed"|"unknown"|"reconciled";actualMicroUsd:number|null;fingerprint:string;at:string;rateCard:string};
const integer=(v:string|undefined)=>v&&/^\d+$/.test(v)&&Number.isSafeInteger(Number(v))&&Number(v)<=1_000_000_000_000?Number(v):0;
export function spendingPolicy(env:Record<string,string|undefined>=process.env):SpendPolicy{
  const rateCard=env.NALBACE_SPEND_RATE_CARD??"";
  return {enabled:env.NALBACE_SPEND_ENABLED==="true"&&/^[A-Za-z0-9._-]{1,80}$/.test(rateCard),rateCard,validUntil:env.NALBACE_SPEND_VALID_UNTIL??"",applicationMicroUsd:integer(env.NALBACE_SPEND_APPLICATION_MICRO_USD),merchantMicroUsd:integer(env.NALBACE_SPEND_MERCHANT_MICRO_USD),aiRequests:integer(env.NALBACE_SPEND_AI_REQUESTS),emailAttempts:integer(env.NALBACE_SPEND_EMAIL_ATTEMPTS),voiceSeconds:integer(env.NALBACE_SPEND_VOICE_SECONDS),aiMaxMicroUsd:integer(env.NALBACE_SPEND_AI_MAX_MICRO_USD),emailMaxMicroUsd:integer(env.NALBACE_SPEND_EMAIL_MAX_MICRO_USD),voiceMaxMicroUsd:integer(env.NALBACE_SPEND_VOICE_MAX_MICRO_USD),aiModel:env.NALBACE_SPEND_AI_MODEL??"",emailProvider:env.NALBACE_SPEND_EMAIL_PROVIDER??"",voiceProvider:env.NALBACE_SPEND_VOICE_PROVIDER??""};
}
function database(){
 const dir=path.join(process.cwd(),".data");mkdirSync(dir,{recursive:true});const db=new DatabaseSync(path.join(dir,"spending.sqlite"));
 db.exec("PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS spend_reservations (id TEXT PRIMARY KEY,merchant TEXT NOT NULL,service TEXT NOT NULL,period TEXT NOT NULL,reservedMicroUsd INTEGER NOT NULL,units INTEGER NOT NULL,state TEXT NOT NULL,actualMicroUsd INTEGER,fingerprint TEXT NOT NULL,at TEXT NOT NULL,rateCard TEXT NOT NULL); CREATE TABLE IF NOT EXISTS spend_events (id INTEGER PRIMARY KEY, reservation TEXT NOT NULL, at TEXT NOT NULL, detail TEXT NOT NULL); CREATE TABLE IF NOT EXISTS spend_incidents (reservation TEXT PRIMARY KEY, at TEXT NOT NULL, detail TEXT NOT NULL);");return db;
}
function month(now:Date){if(!Number.isFinite(now.getTime()))throw new Error("A valid budget period is required.");return now.toISOString().slice(0,7);}
function totals(rows:SpendReservation[],period:string){
 let microUsd=0,aiRequests=0,emailAttempts=0,voiceSeconds=0;
 for(const r of rows){const unresolved=r.state==="reserved"||r.state==="unknown";if(r.period!==period&&!unresolved)continue;microUsd+=unresolved||r.state==="committed"?r.reservedMicroUsd:r.actualMicroUsd!;if(r.service==="ai")aiRequests+=r.units;else if(r.service==="email")emailAttempts+=r.units;else voiceSeconds+=r.units;}
 return {microUsd,aiRequests,emailAttempts,voiceSeconds};
}
function audit(db:DatabaseSync,id:string,detail:string,now:Date){db.prepare("INSERT INTO spend_events(reservation,at,detail) VALUES(?,?,?)").run(id,now.toISOString(),detail);}
export function reserveSpend(id:string,merchant:string,service:SpendService,binding:string,units=1,policy=spendingPolicy(),now=new Date()):SpendReservation{
 const period=month(now),maxCost=service==="ai"?policy.aiMaxMicroUsd:service==="email"?policy.emailMaxMicroUsd:policy.voiceMaxMicroUsd;
 if(!/^[A-Za-z0-9._:-]{1,128}$/.test(id)||!/^[A-Za-z0-9._-]{1,80}$/.test(merchant)||!["ai","email","voice"].includes(service)||!Number.isSafeInteger(units)||units<1||(service!=="voice"&&units!==1)||(service==="voice"&&units>120))throw new Error("Review the bounded spending reservation.");
 const expected=service==="ai"?policy.aiModel:service==="email"?policy.emailProvider:policy.voiceProvider;
 if(!policy.enabled||!policy.rateCard||!Number.isFinite(Date.parse(policy.validUntil))||Date.parse(policy.validUntil)<=now.getTime()||!binding||binding!==expected||!Number.isSafeInteger(maxCost)||maxCost<=0)throw new Error("Spending is disabled until an approved rate card and budgets are configured.");
 const fingerprint=createHash("sha256").update(JSON.stringify({merchant,service,binding,units,maxCost,rateCard:policy.rateCard})).digest("hex");
 const db=database();db.exec("BEGIN IMMEDIATE");
 try{
  if(db.prepare("SELECT reservation FROM spend_incidents LIMIT 1").get())throw new Error("Spending is blocked by a billing incident requiring operator review.");
  const existing=db.prepare("SELECT * FROM spend_reservations WHERE id=?").get(id) as SpendReservation|undefined;
  if(existing){if(existing.fingerprint!==fingerprint)throw new Error("Spending retry does not match its original reservation.");db.exec("COMMIT");return {...existing};}
  const rows=db.prepare("SELECT * FROM spend_reservations").all() as SpendReservation[],app=totals(rows,period),business=totals(rows.filter(r=>r.merchant===merchant),period);
  if(!Number.isSafeInteger(policy.applicationMicroUsd)||!Number.isSafeInteger(policy.merchantMicroUsd)||maxCost>policy.applicationMicroUsd-app.microUsd||maxCost>policy.merchantMicroUsd-business.microUsd)throw new Error("Monthly application or business spending limit reached.");
  const cap=service==="ai"?policy.aiRequests:service==="email"?policy.emailAttempts:policy.voiceSeconds,used=service==="ai"?business.aiRequests:service==="email"?business.emailAttempts:business.voiceSeconds;
  if(!Number.isSafeInteger(cap)||units>cap-used)throw new Error("Monthly service allowance reached.");
  const r:SpendReservation={id,merchant,service,period,reservedMicroUsd:maxCost,units,state:"reserved",actualMicroUsd:null,fingerprint,at:now.toISOString(),rateCard:policy.rateCard};
  db.prepare("INSERT INTO spend_reservations VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(r.id,r.merchant,r.service,r.period,r.reservedMicroUsd,r.units,r.state,null,r.fingerprint,r.at,r.rateCard);audit(db,id,"Maximum cost and units reserved",now);db.exec("COMMIT");return r;
 }catch(e){db.exec("ROLLBACK");throw e;}finally{db.close();}
}
export function recordSpendOutcome(id:string,outcome:"committed"|"unknown",now=new Date()){
 const db=database();db.exec("BEGIN IMMEDIATE");try{
  const r=db.prepare("SELECT * FROM spend_reservations WHERE id=?").get(id) as SpendReservation|undefined;if(!r)throw new Error("Spending reservation not found.");
  if(r.state==="reserved"){db.prepare("UPDATE spend_reservations SET state=? WHERE id=?").run(outcome,id);audit(db,id,outcome==="committed"?"Provider returned; full ceiling retained pending billing reconciliation":"Provider outcome uncertain; full ceiling retained",now);}
  db.exec("COMMIT");
 }catch(e){db.exec("ROLLBACK");throw e;}finally{db.close();}
}
// Only trusted operator billing evidence may reconcile money. Units are not
// refunded; an exhausted attempt is not permission to contact a person again.
export function reconcileSpend(id:string,actualMicroUsd:number,evidence:string,now=new Date()){
 if(!Number.isSafeInteger(actualMicroUsd)||actualMicroUsd<0||!/^[A-Za-z0-9._:-]{8,120}$/.test(evidence))throw new Error("Verified billing evidence and exact micro-dollar cost are required.");
 const db=database();let committed=false;db.exec("BEGIN IMMEDIATE");try{
  const r=db.prepare("SELECT * FROM spend_reservations WHERE id=?").get(id) as SpendReservation|undefined;
  if(!r||r.state==="reserved")throw new Error("Resolve the provider outcome before billing reconciliation.");
  if(actualMicroUsd>r.reservedMicroUsd){
   db.prepare("INSERT OR IGNORE INTO spend_incidents VALUES(?,?,?)").run(id,now.toISOString(),`Actual micro USD ${actualMicroUsd} exceeded reserved ${r.reservedMicroUsd}`);
   audit(db,id,"Billing incident: all further spending blocked",now);db.exec("COMMIT");committed=true;
   throw new Error("Provider cost exceeded the reserved ceiling; spending blocked pending operator review.");
  }
  if(r.state==="reconciled"){if(r.actualMicroUsd!==actualMicroUsd)throw new Error("Billing reconciliation is already final.");db.exec("COMMIT");return;}
  db.prepare("UPDATE spend_reservations SET state='reconciled',actualMicroUsd=? WHERE id=?").run(actualMicroUsd,id);audit(db,id,`Billing reconciled: ${evidence}; actual micro USD ${actualMicroUsd}`,now);db.exec("COMMIT");
 }catch(e){if(!committed)db.exec("ROLLBACK");throw e;}finally{db.close();}
}
export function spendingSummary(merchant:string,policy=spendingPolicy(),now=new Date()){
 const db=database();try{const rows=db.prepare("SELECT * FROM spend_reservations").all() as SpendReservation[],period=month(now);return {period,incidents:Number((db.prepare("SELECT count(*) AS n FROM spend_incidents").get() as {n:number}).n),enabled:policy.enabled,rateCard:policy.rateCard||null,application:{used:totals(rows,period),limitMicroUsd:policy.applicationMicroUsd},business:{used:totals(rows.filter(r=>r.merchant===merchant),period),limitMicroUsd:policy.merchantMicroUsd,aiRequests:policy.aiRequests,emailAttempts:policy.emailAttempts,voiceSeconds:policy.voiceSeconds},unresolved:rows.filter(r=>r.state==="reserved"||r.state==="unknown").length};}finally{db.close();}
}

export function spendAvailable(merchant:string,service:SpendService,binding:string){
 const p=spendingPolicy(),s=spendingSummary(merchant,p),cost=service==="ai"?p.aiMaxMicroUsd:service==="email"?p.emailMaxMicroUsd:p.voiceMaxMicroUsd;
 const expected=service==="ai"?p.aiModel:service==="email"?p.emailProvider:p.voiceProvider;
 const cap=service==="ai"?p.aiRequests:service==="email"?p.emailAttempts:p.voiceSeconds,used=service==="ai"?s.business.used.aiRequests:service==="email"?s.business.used.emailAttempts:s.business.used.voiceSeconds;
 return p.enabled&&Date.parse(p.validUntil)>Date.now()&&!s.incidents&&binding!==""&&binding===expected&&cost>0&&cost<=p.applicationMicroUsd-s.application.used.microUsd&&cost<=p.merchantMicroUsd-s.business.used.microUsd&&used<cap;
}
