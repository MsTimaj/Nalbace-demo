import test from "node:test";
import assert from "node:assert/strict";
import {emailDisplay} from "../src/domain/email-display.ts";
test("display separates quoted email without rewriting the customer's reply",()=>{const source="I dispute the work.\r\n\r\nOn Tue, Nov 10, someone wrote:\r\n> Hello Fatima,\r\n> Original reminder";const view=emailDisplay(source);assert.equal(view.message,"I dispute the work.");assert.equal(view.earlier.includes(">"),false);assert.equal(source.includes("> Hello Fatima"),true);assert.equal(emailDisplay("No quotation here").message,"No quotation here");assert.equal(emailDisplay("> A quoted-only reply").message,"> A quoted-only reply");});
