import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import path from "node:path";
import os from "node:os";
import {readVoiceSelfTest,saveVoiceSelfTest,selfTestWording} from "../src/server/voice-self-test.ts";
test("private phone form requires explicit agreement and stores only bounded test evidence",()=>{
 const prior=process.cwd();process.chdir(mkdtempSync(path.join(os.tmpdir(),"nalbace-selftest-")));try{
 assert.equal(readVoiceSelfTest(),null);assert.throws(()=>saveVoiceSelfTest("+12025550123",false));assert.throws(()=>saveVoiceSelfTest("arbitrary",true));assert.equal(readVoiceSelfTest(),null);
 const response=saveVoiceSelfTest("+12025550123",true);assert.ok(!JSON.stringify(response).includes("12025550123"));const saved=readVoiceSelfTest()!;assert.equal(saved.wording,selfTestWording);assert.equal(saved.phone,"+12025550123");assert.ok(Number.isFinite(Date.parse(saved.capturedAt)));
 }finally{process.chdir(prior);}
});
