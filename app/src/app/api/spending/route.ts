import {NextResponse} from "next/server";
import {requireLocalRequest} from "../../../server/local-request.ts";
import {spendingSummary} from "../../../server/spending.ts";
import {DEMO_OWNER} from "../../../server/fixtures.ts";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 try{requireLocalRequest(request);}catch{return NextResponse.json({error:"Local access required."},{status:403});}
 try{return NextResponse.json(spendingSummary(DEMO_OWNER.merchantId),{headers:{"Cache-Control":"no-store"}});}catch{return NextResponse.json({error:"Spending status unavailable."},{status:503});}
}
