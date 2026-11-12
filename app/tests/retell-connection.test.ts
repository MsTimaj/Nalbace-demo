import test from "node:test";
import assert from "node:assert/strict";
import {retellConnection,voiceConfiguration} from "../src/server/retell-connection.ts";
const config={NALBACE_RETELL_API_KEY:"offline-synthetic-secret-only",NALBACE_RETELL_AGENT_ID:"agent_synthetic",NALBACE_RETELL_AGENT_VERSION:"1",NALBACE_VOICE_FROM:"+12025550124",NALBACE_VOICE_TEST_RECIPIENT:"+12025550123"};
test("Retell credentials never enable calling alone; missing and unbounded config fail closed",()=>{
 assert.ok(retellConnection(config));assert.equal(voiceConfiguration(config).ready,false);assert.equal(retellConnection({...config,NALBACE_RETELL_AGENT_VERSION:"latest_published"}),null);assert.ok(retellConnection({...config,NALBACE_RETELL_AGENT_VERSION:"0"}));assert.equal(retellConnection({...config,NALBACE_VOICE_TEST_RECIPIENT:""}),null);assert.equal(voiceConfiguration({...config,NALBACE_VOICE_ENABLED:"true",NALBACE_VOICE_MAX_ATTEMPTS:"1"}).ready,false);
 const ready={...config,NALBACE_VOICE_ENABLED:"true",NALBACE_VOICE_INTEGRATION_READY:"true",NALBACE_VOICE_MAX_ATTEMPTS:"1"};assert.equal(voiceConfiguration(ready).ready,true);assert.equal(voiceConfiguration({...ready,NALBACE_VOICE_MAX_ATTEMPTS:"4"}).ready,false);assert.equal(voiceConfiguration({...ready,NALBACE_VOICE_MAX_ATTEMPTS:"0"}).ready,false);
});
test("key, agent version, destination and caller identity are all bound",()=>{
 const before=retellConnection(config)!.binding;for(const change of [{NALBACE_RETELL_API_KEY:"another-offline-synthetic-secret"},{NALBACE_RETELL_AGENT_VERSION:"2"},{NALBACE_VOICE_TEST_RECIPIENT:"+12025550125"},{NALBACE_VOICE_FROM:"+12025550126"}])assert.notEqual(retellConnection({...config,...change})!.binding,before);assert.equal(retellConnection({...config,NALBACE_RETELL_API_KEY:"bad\r\nsecret"}),null);
});
