import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import path from "node:path";
import os from "node:os";
import {heartbeatVoiceSupervisor,requireVoiceSupervisor,releaseVoiceSupervisor} from "../src/server/voice-supervisor-lease.ts";
test("supervisor ownership, exact binding, freshness and release are durable gates",()=>{
 const prior=process.cwd();process.chdir(mkdtempSync(path.join(os.tmpdir(),"nalbace-lease-")));try{
 const approval="offline-approval",token="a".repeat(32),binding="b".repeat(64);
 assert.throws(()=>requireVoiceSupervisor(approval,binding,10000));heartbeatVoiceSupervisor(approval,token,binding,10000);requireVoiceSupervisor(approval,binding,10001);
 assert.throws(()=>requireVoiceSupervisor(approval,"c".repeat(64),10001));assert.throws(()=>requireVoiceSupervisor(approval,binding,9999));assert.throws(()=>requireVoiceSupervisor(approval,binding,15001));
 assert.throws(()=>heartbeatVoiceSupervisor(approval,"d".repeat(32),binding,11000));releaseVoiceSupervisor(approval,"d".repeat(32));requireVoiceSupervisor(approval,binding,11000);releaseVoiceSupervisor(approval,token);assert.throws(()=>requireVoiceSupervisor(approval,binding,11000));
 }finally{process.chdir(prior);}
});
