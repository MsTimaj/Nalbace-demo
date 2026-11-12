import type {ClientCase} from "../domain/cases.ts";
import {financials} from "../domain/case-rules.ts";
import {customerAllowsAiCalls} from "../domain/customer-calling.ts";
import Icon from "./ui-icon.tsx";
const dateLabel=(date:string)=>new Date(date+"T12:00:00Z").toLocaleDateString("en-US",{month:"short",day:"numeric"});
const plusDays=(date:string,days:number)=>new Date(Date.parse(date+"T12:00:00Z")+days*86400000).toISOString().slice(0,10);
export default function AutomaticFollowupProgress({client}:{client:ClientCase}){
 const plan=client.automaticFollowup;if(!plan)return null;
 const first=plan.completed.find(step=>step.key==="first"),second=plan.completed.find(step=>step.key==="second");
 const callAllowed=customerAllowsAiCalls(client)&&/^\+[1-9]\d{6,14}$/.test(client.contactPermission?.phone??"");
 const steps=plan.stage==="overdue"?[{key:"first",label:"First email",date:first?.on??plan.startedOn},{key:"second",label:"Second email",date:second?.on??plusDays(first?.on??plan.startedOn,7)},...(callAllowed?[{key:"call",label:"AI phone call",date:plusDays(second?.on??plusDays(first?.on??plan.startedOn,7),7)}]:[])]:[{key:"before",label:"Before-due email",date:plan.completed.find(step=>step.key==="before")?.on},{key:"due",label:"Due-date email",date:client.invoices.map(invoice=>invoice.dueDate).sort()[0]}];
 const paymentHeld=financials(client).pendingMinor>0;
 const stopped=paymentHeld||client.hold!=="none"||plan.status==="settled"||plan.status==="owner-review";
 return <section className="card"><h2>Follow-up progress</h2><p className="hint">Demo simulation: completed steps below did not send real messages.</p><ul className="conversation-history">{steps.map(step=>{const done=plan.completed.find(item=>item.key===step.key);return <li key={step.key}><div className="section-title"><span className="silver-icon"><Icon name={done?"check":"clock"}/></span><strong>{step.label}</strong><span className={`status progress-badge ${done?"is-complete":stopped?"is-neutral":"is-pending"}`}>{done?"Completed":stopped?(paymentHeld||client.hold!=="none"?"Paused":"Not scheduled"):"Pending"}</span></div><p>{done?dateLabel(done.on):stopped?"Waiting for owner review":step.date?dateLabel(step.date):"At the configured reminder date"}{done?" · simulated":!stopped?" · if still unpaid and eligible":""}</p></li>;})}</ul>{!callAllowed&&<p className="hint">Email only. AI calling is off or its agreement/contact details are not recorded.</p>}<p>{paymentHeld?"Customer reported a check; the owner recorded receipt. Reminders are paused until clearance is confirmed.":plan.status==="owner-review"?"Sequence complete: review the remaining balance.":plan.reason}</p></section>;
}
