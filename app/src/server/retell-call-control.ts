import "server-only";

// Transport foundation only: no call creation, public route or background worker.
// Call/agent binding must come from a future trusted durable call reservation.
export type RetellCallBinding={callId:string;agentId:string};
export type RetellCallState={status:"registered"|"not_connected"|"ongoing"|"ended"|"error";ended:boolean};
export class RetellControlError extends Error {
  constructor(){super("Call control could not be confirmed. Keep the call unresolved for review.");}
}
const statuses=new Set(["registered","not_connected","ongoing","ended","error"]);
function validBinding(binding:RetellCallBinding){
  return /^[A-Za-z0-9_-]{1,100}$/.test(binding.callId)&&/^[A-Za-z0-9_-]{1,100}$/.test(binding.agentId);
}
export function retellCallControl(apiKey:string,binding:RetellCallBinding,request:typeof fetch=fetch){
  if(!apiKey.trim()||apiKey.length>1000||/[\s]/.test(apiKey)||!validBinding(binding))throw new RetellControlError();
  const saved=Object.freeze({...binding});
  async function send(operation:"get-call"|"stop-call"){
    try{
      const response=await request(`https://api.retellai.com/v2/${operation}/${saved.callId}`,{
        method:operation==="get-call"?"GET":"POST",
        headers:{Authorization:`Bearer ${apiKey}`,Accept:"application/json"},
        redirect:"error",cache:"no-store",signal:AbortSignal.timeout(5000),
      });
      if(!response.ok)throw new RetellControlError();
      return response;
    }catch{throw new RetellControlError();} // Never return provider bodies, tokens or transcripts.
  }
  async function read():Promise<RetellCallState>{
    try{
      const response=await send("get-call");
      const body:unknown=await response.json();
      if(!body||typeof body!=="object"||Array.isArray(body))throw new RetellControlError();
      const value=body as Record<string,unknown>;
      if(value.call_id!==saved.callId||value.agent_id!==saved.agentId||typeof value.call_status!=="string"||!statuses.has(value.call_status))throw new RetellControlError();
      const status=value.call_status as RetellCallState["status"];
      return {status,ended:status==="ended"};
    }catch{throw new RetellControlError();}
  }
  async function stop():Promise<{state:"already-ended"|"confirmed-ended"|"stop-requested"}>{
    const before=await read();
    if(before.ended)return {state:"already-ended"};
    // Only an ongoing call is stoppable through this narrow adapter. Registration,
    // errors and failed connections require lifecycle reconciliation, not a guess.
    if(before.status!=="ongoing")throw new RetellControlError();
    const response=await send("stop-call");
    if(response.status!==204)throw new RetellControlError();
    const after=await read();
    return {state:after.ended?"confirmed-ended":"stop-requested"};
  }
  return {read,stop};
}
