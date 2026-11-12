import type {ClientCase} from "./cases.ts";
import type {WorkspaceControls} from "./workspace-controls.ts";
import {caseView} from "./case-view.ts";
import {remainingInvoices} from "./case-rules.ts";
import {hasUnreviewedReply} from "./reply-review.ts";
export const defaultUrgentOverdueDays=90;
export function relationshipConcernOpen(c:ClientCase){return c.customerUpdates?.filter(x=>x.kind==="relationship-concern"||x.kind==="relationship-resolved").at(-1)?.kind==="relationship-concern";}
export function accountPriority(c:ClientCase,controls?:WorkspaceControls,now=new Date()){
 const threshold=controls?.urgentOverdueDays??defaultUrgentOverdueDays,view=caseView(c,now),reasons:string[]=[];
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now),part=(key:string)=>parts.find(p=>p.type===key)!.value;
 const today=Date.parse(`${part("year")}-${part("month")}-${part("day")}T00:00:00Z`);
 const ages=remainingInvoices(c).map(i=>/^\d{4}-\d{2}-\d{2}$/.test(i.dueDate)?Math.max(0,Math.floor((today-Date.parse(i.dueDate+"T00:00:00Z"))/86400000)):0).filter(Number.isFinite);
 const overdueDays=Math.max(0,...ages),latestReply=c.pastedReplies?.at(-1),aiConcern=hasUnreviewedReply(c)&&latestReply?.proposal&&["dispute","stop","relationship-concern"].includes(latestReply.proposal.intent);
 if(c.hold==="dispute")reasons.push("Open dispute · owner resolution needed");
 if(relationshipConcernOpen(c))reasons.push("Relationship concern · owner follow-up needed");
 if(c.hold==="suppressed")reasons.push("Contact stopped · review without sending reminders");
 if(aiConcern)reasons.push("AI flagged a possible concern · read the supporting message");
 if(view.remaining>0&&overdueDays>=threshold)reasons.push(`${overdueDays} days overdue · reaches your ${threshold}-day threshold`);
 const automated=controls?.reminderPolicy?.enabled&&c.source==="fixture"?c.automaticFollowup:undefined;
 const settledWithoutReview=view.remaining===0&&view.pending===0&&!c.reconciliationRequired&&!hasUnreviewedReply(c);
 const group=reasons.length?"urgent":settledWithoutReview?"waiting":automated?.status==="owner-review"?"review":automated&&view.eligible?"waiting":view.category==="ready"||view.category==="decision"?"review":"waiting";
 return {group,reason:reasons[0]??(settledWithoutReview?"Settled: no payment action needed":c.hold==="owner-review"&&!hasUnreviewedReply(c)?"Follow-up held: review the case before resuming":automated?.status==="owner-review"?"Sequence finished · owner decision needed":hasUnreviewedReply(c)?"Customer replied · review the message":automated?automated.reason:view.eligible?"Review one follow-up":view.reason),reasons,overdueDays,threshold,relationshipOpen:relationshipConcernOpen(c),aiConcern:Boolean(aiConcern),remaining:view.remaining};
}
