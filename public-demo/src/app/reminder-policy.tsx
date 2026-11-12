
import {useState} from "react";
import type {WorkspaceControls} from "../domain/workspace-controls.ts";

export default function ReminderPolicy({controls,busy,onSave}:{controls:WorkspaceControls;busy:boolean;onSave:(policy:NonNullable<WorkspaceControls["reminderPolicy"]>,revision:number)=>Promise<boolean>}){
  const policy=controls.reminderPolicy;
  const [enabled,setEnabled]=useState(policy?.enabled??false);
  const [beforeDays,setBeforeDays]=useState<7|14>(policy?.beforeDays??7);
  const [businessName,setBusinessName]=useState(policy?.businessName??"Oak & Harbor Services (sample business)");
  const [demoDate,setDemoDate]=useState(policy?.demoDate??"");
  return <section className="card"><h2>Automatic reminder policy</h2>
    <p>Set the schedule once. Each customer’s AI-call setting applies across their invoices.</p>
    <p className="sample-notice">Local demo simulation · sample customers only. Simulated emails and calls appear in their history.</p>
    <form onSubmit={async event=>{event.preventDefault();await onSave({enabled,beforeDays,businessName,...(demoDate?{demoDate}:{})},controls.revision);}}>
      <label>Business name in reminders<input required maxLength={120} value={businessName} onChange={event=>setBusinessName(event.target.value)}/></label>
      <label>First courtesy email<select value={beforeDays} onChange={event=>setBeforeDays(Number(event.target.value) as 7|14)}><option value={7}>7 days before the due date</option><option value={14}>14 days before the due date</option></select></label>
      <p>On the due date: one email if unpaid. Once overdue: first email, another seven days later, then one permitted call seven days after that. Recent contact is checked before each step.</p>
      <label className="check-label"><input type="checkbox" checked={enabled} onChange={event=>setEnabled(event.target.checked)}/>Run automatic sample reminders</label>
      <label>Demo date (optional)<input type="date" value={demoDate} min={policy?.demoDate} onChange={event=>setDemoDate(event.target.value)}/></label>
      <p className="hint">Leave blank to use today. Advance the demo date to test later steps. The simulation runs while this workspace is open.</p>
      <button className="primary full" disabled={busy}>Save reminder policy</button>
    </form>
  </section>;
}
