export type AiStatus={ready:boolean;keyPresent:boolean;modelSelected:boolean;used:number;limit:number;message:string;pending:{id:string;caseId:string;at:string}[]};
export type DeliveryStatus={ready:boolean;used:number;limit:number;pending:number};
export function serviceAvailability(status:{ready:boolean;used:number;limit:number;pending:number}|null){
  if(!status)return "Status unavailable";
  if(status.pending>0)return "Needs review";
  if(!status.ready||!Number.isSafeInteger(status.limit)||status.limit<=0)return "Not available in this demo";
  if(!Number.isSafeInteger(status.used)||status.used<0)return "Status unavailable";
  return status.used>=status.limit?"Test allowance used":"Available for approved tests";
}
