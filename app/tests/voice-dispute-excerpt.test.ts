import test from "node:test";
import assert from "node:assert/strict";
import {voiceDisputeExcerpt} from "../src/domain/voice-dispute-excerpt.ts";
test("dispute excerpt preserves the customer's reason after one neutral question",()=>{assert.equal(voiceDisputeExcerpt([{role:"user",content:"I dispute the invoice."},{role:"agent",content:"Could you tell me what you are disputing?"},{role:"user",content:"The agreed work was not completed."}]),"I dispute the invoice.\nThe agreed work was not completed.");});
test("agent statements are not customer evidence and missing reasons are not invented",()=>{assert.equal(voiceDisputeExcerpt([{role:"agent",content:"The wrong amount is disputed"},{role:"user",content:"Hello"}]),undefined);assert.equal(voiceDisputeExcerpt([{role:"user",content:"There is a dispute"},{role:"agent",content:"The owner will review it"}]),"There is a dispute");});
test("transcript excerpt is bounded",()=>{assert.equal(voiceDisputeExcerpt([{role:"user",content:"I dispute "+"x".repeat(2000)}])!.length,1000);});
