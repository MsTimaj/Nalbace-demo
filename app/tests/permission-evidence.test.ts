import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {validatePermissionEvidence,hasSelfTestEmailEvidence} from "../src/domain/permission-evidence.ts";
import {readWorkspace,saveContactPermission,prepareDraft,approveDraft,recordCustomerUpdate} from "../src/server/store.ts";
import {contactEligibility} from "../src/domain/case-rules.ts";
const evidence={basis:"self-test",wording:"I agree to email invoice reminders from this merchant using Nalbace at my own address.",capturedAt:"2026-01-01T12:00:00Z",reference:"Synthetic roleplay record"};
const permission={email:"owner@example.test",verified:true,emailAllowed:true,voiceAllowed:false,phone:"",note:"Own synthetic test",evidence};
function temporary(fn:()=>void){const previous=process.cwd();process.chdir(mkdtempSync(path.join(os.tmpdir(),"nalbace-permission-")));try{fn();}finally{process.chdir(previous);}}
test("evidence rejects missing wording/source, invalid and future times without granting anything",()=>temporary(()=>{
  const before=readWorkspace(),c=before.cases.find(c=>c.id==="birch")!;
  for(const change of [{basis:"imported"},{wording:" "},{reference:""},{wording:"x".repeat(2001)},{capturedAt:"bad"},{capturedAt:"2999-01-01T00:00:00Z"}]){
    assert.throws(()=>saveContactPermission(c.id,c.version,{...permission,evidence:{...evidence,...change}}),/Enter/);
    assert.deepEqual(readWorkspace(),before);
  }
  assert.equal(validatePermissionEvidence(evidence).capturedAt,"2026-01-01T12:00:00.000Z");
}));
test("reviews preserve prior evidence, invalidate approval, and latest evidence cannot transfer destinations",()=>temporary(()=>{
  let c=readWorkspace().cases.find(c=>c.id==="birch")!;
  assert.equal(hasSelfTestEmailEvidence(c),false);
  saveContactPermission(c.id,c.version,permission);
  c=readWorkspace().cases.find(c=>c.id==="birch")!;
  assert.equal(hasSelfTestEmailEvidence(c),true);
  const first=structuredClone(c.permissionReviews![0]);
  const d=prepareDraft(c.id);approveDraft(c.id,d.id,d.subject,d.body);
  saveContactPermission(c.id,c.version,{...permission,email:"changed@example.test",evidence:undefined});
  const w=readWorkspace();c=w.cases.find(c=>c.id==="birch")!;
  assert.equal(w.approvals.length,0);assert.equal(c.permissionReviews!.length,2);assert.deepEqual(c.permissionReviews![0],first);assert.equal(hasSelfTestEmailEvidence(c),false);
  assert.throws(()=>saveContactPermission(c.id,c.version-1,permission),/case changed/);
  assert.equal(readWorkspace().cases.find(item=>item.id===c.id)!.permissionReviews!.length,2);
}));
test("turning permission off needs no new grant and later evidence cannot clear a stop",()=>temporary(()=>{
  let c=readWorkspace().cases.find(c=>c.id==="birch")!;
  saveContactPermission(c.id,c.version,permission);
  c=readWorkspace().cases.find(c=>c.id==="birch")!;
  saveContactPermission(c.id,c.version,{...permission,emailAllowed:false,evidence:undefined});
  c=readWorkspace().cases.find(c=>c.id==="birch")!;
  assert.equal(hasSelfTestEmailEvidence(c),false);assert.equal(contactEligibility(c,new Date()).eligible,false);
  recordCustomerUpdate(c.id,"stop","Stop all follow-up",null,"permission-stop-evidence");
  c=readWorkspace().cases.find(c=>c.id==="birch")!;
  saveContactPermission(c.id,c.version,permission);
  c=readWorkspace().cases.find(c=>c.id==="birch")!;
  assert.equal(c.hold,"suppressed");assert.equal(contactEligibility(c,new Date()).eligible,false);
}));
