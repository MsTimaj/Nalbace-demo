import test from "node:test";
import assert from "node:assert/strict";
import {workspaceSync} from "../src/app/workspace-sync.ts";
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};}
test("a saved paid case replaces the screen's unpaid snapshot",async()=>{
  let displayed={status:"UNPAID",dueMinor:2500};
  const sync=workspaceSync(async()=>({status:"PAID",dueMinor:0}),value=>{displayed=value;},()=>assert.fail());
  await sync.refresh();assert.deepEqual(displayed,{status:"PAID",dueMinor:0});sync.dispose();
});
test("an older background read cannot overwrite a completed owner action",async()=>{
  const old=deferred<string>();const displayed:string[]=[];
  const sync=workspaceSync(()=>old.promise,value=>displayed.push(value),()=>assert.fail());
  const pending=sync.refresh();const finish=sync.beginMutation();sync.replace("updated payment evidence");finish();old.resolve("old unpaid snapshot");await pending;
  assert.deepEqual(displayed,["updated payment evidence"]);sync.dispose();
});
test("background refresh pauses for mutations and does not overlap reads",async()=>{
  let calls=0;const read=deferred<string>();
  const sync=workspaceSync(()=>{calls++;return read.promise;},()=>{},()=>assert.fail());
  const finish=sync.beginMutation();await sync.refresh();assert.equal(calls,0);finish();
  const first=sync.refresh();await sync.refresh();assert.equal(calls,1);read.resolve("current");await first;sync.dispose();
});
test("unmounted screens discard in-flight updates and abort their requests",async()=>{
  const read=deferred<string>();let applied=false,signal:AbortSignal|undefined;
  const sync=workspaceSync(s=>{signal=s;return read.promise;},()=>{applied=true;},()=>assert.fail());
  const pending=sync.refresh();sync.dispose();assert.equal(signal?.aborted,true);read.resolve("old");await pending;assert.equal(applied,false);
});
test("failed saved-state reads surface a warning and a later refresh can recover",async()=>{
  let calls=0,failures=0,current="";
  const sync=workspaceSync(async()=>{if(calls++===0)throw new Error("offline");return "saved paid state";},value=>{current=value;},()=>failures++);
  await sync.refresh();assert.equal(failures,1);await sync.refresh();assert.equal(current,"saved paid state");sync.dispose();
});
