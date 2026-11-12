import test from "node:test";
import assert from "node:assert/strict";
import {serviceAvailability} from "../src/app/service-status.ts";
test("service availability does not advertise exhausted, disabled or uncertain capacity",()=>{
  assert.equal(serviceAvailability(null),"Status unavailable");
  assert.equal(serviceAvailability({ready:true,used:0,limit:0,pending:0}),"Not available in this demo");
  assert.equal(serviceAvailability({ready:false,used:0,limit:3,pending:0}),"Not available in this demo");
  assert.equal(serviceAvailability({ready:true,used:3,limit:3,pending:0}),"Test allowance used");
  assert.equal(serviceAvailability({ready:false,used:1,limit:3,pending:1}),"Needs review");
  assert.equal(serviceAvailability({ready:true,used:0,limit:3,pending:0}),"Available for approved tests");
  assert.equal(serviceAvailability({ready:true,used:-1,limit:3,pending:0}),"Status unavailable");
});
