import test from "node:test";
import assert from "node:assert/strict";
import {requireLocalHeaders,requireLocalRequest} from "../src/server/local-request.ts";
test("initial page and API share an exact local host boundary",()=>{
  for(const host of ["localhost:3000","127.0.0.1:3000"])assert.doesNotThrow(()=>requireLocalHeaders(new Headers({host})));
  for(const host of ["attacker.example:3000","localhost.attacker.example:3000","127.0.0.1:3000.attacker.example","localhost:3001",""])assert.throws(()=>requireLocalHeaders(new Headers({host})),/Local access/);
  // Forwarded headers cannot upgrade an untrusted original host.
  assert.throws(()=>requireLocalHeaders(new Headers({host:"attacker.example:3000","x-forwarded-host":"localhost:3000"})),/Local access/);
});
test("a local hostname alone does not permit a cross-site write",()=>{
  for(const origin of ["https://attacker.example","http://localhost:3001","null"]){
    assert.throws(()=>requireLocalRequest(new Request("http://localhost:3000",{headers:{host:"localhost:3000",origin}}),true),/Local origin/);
  }
});
