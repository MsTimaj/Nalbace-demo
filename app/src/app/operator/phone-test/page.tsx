import {headers} from "next/headers";
import {notFound} from "next/navigation";
import {requireLocalHeaders} from "../../../server/local-request.ts";
import {readVoiceSelfTest,selfTestWording} from "../../../server/voice-self-test.ts";
import PhoneForm from "./phone-form.tsx";
export const dynamic="force-dynamic";
export default async function PhoneTestPage(){
 try{requireLocalHeaders(await headers());}catch{notFound();}
 return <div className="app-shell"><main><h1>One phone test</h1><p>One synthetic call, up to 60 seconds. Your number stays out of chat.</p><PhoneForm wording={selfTestWording} saved={Boolean(readVoiceSelfTest())}/><a href="/">Back to Nalbace</a></main></div>;
}
