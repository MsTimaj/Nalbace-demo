import {NextRequest,NextResponse} from "next/server";
import {existsSync,readFileSync,renameSync} from "node:fs";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import path from "node:path";
import {readWorkspace} from "../../../server/store.ts";
export const runtime="nodejs";export const dynamic="force-dynamic";
const ready=()=>path.join(process.cwd(),".data/recording-call-click-ready.json");
function local(r:NextRequest,write=false){const hosts=["127.0.0.1:3000","localhost:3000"];if(!hosts.includes(r.headers.get("host")??"")||write&&!hosts.map(h=>"http://"+h).includes(r.headers.get("origin")??""))throw new Error("Local-only test");}
function available(){try{const g=JSON.parse(readFileSync(ready(),"utf8"));return g.approved===true&&Date.parse(g.expiresAt)>Date.now()&&!existsSync(path.join(process.cwd(),".data/recording-call-started.json"))&&!readWorkspace().voiceCalls?.some(c=>c.caseId==="sandbox-recording-call");}catch{return false;}}
export async function GET(r:NextRequest){try{local(r);return NextResponse.json({ready:available()},{headers:{"Cache-Control":"no-store"}});}catch{return NextResponse.json({ready:false},{status:403});}}
export async function POST(r:NextRequest){try{local(r,true);if(!available())return NextResponse.json({error:"This one-call test is unavailable or already used."},{status:409});renameSync(ready(),ready()+".used");const result=await promisify(execFile)(process.execPath,["--experimental-strip-types","--conditions=react-server",".data/run-recording-call.mjs"],{cwd:process.cwd(),windowsHide:true,timeout:45000,maxBuffer:16000});const line=result.stdout.trim().split("\n").at(-1);const status=JSON.parse(line??"{}");if(status.state!=="accepted")throw new Error("Not confirmed");return NextResponse.json({accepted:true,message:"Call started. Answer your saved test phone. Maximum 60 seconds; no retry."});}catch{return NextResponse.json({error:"Call could not be confirmed. Do not retry; review the saved test outcome."},{status:409});}}
