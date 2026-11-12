import "server-only";
import {setTimeout as delay} from "node:timers/promises";
import {monitorVoiceCall} from "./voice-monitor.ts";

type Step=(id:string,heartbeat:string,request:typeof fetch,now:Date)=>Promise<{state:"ongoing"|"ended"|"stop-requested"}>;
// Run in a separate process from the web server. Never creates or retries calls.
// Finite polling is deliberate: an unavailable provider stays unresolved, not
// falsely marked ended. Provider-side duration limits are still required.
export async function superviseVoiceCall(id:string,options:{request?:typeof fetch;step?:Step;clock?:()=>number;wait?:(ms:number)=>Promise<unknown>}={}){
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(id))throw new Error("A saved voice attempt is required.");
 const request=options.request??fetch,step=options.step??monitorVoiceCall,clock=options.clock??Date.now,wait=options.wait??delay;
 const started=clock();
 for(let poll=0;poll<40&&clock()-started<90000;poll++){
  const now=new Date(clock());
  try{if((await step(id,now.toISOString(),request,now)).state==="ended")return {state:"ended" as const};}catch{/* Fixed bounded read/stop reconciliation only. Never re-dispatch. */}
  await wait(2000);
 }
 // A stale heartbeat forces the monitor into its stop path on the final pass.
 const now=new Date(clock());
 try{if((await step(id,new Date(now.getTime()-11000).toISOString(),request,now)).state==="ended")return {state:"ended" as const};}catch{/* Unknown stays held for operator review. */}
 return {state:"unresolved" as const};
}
