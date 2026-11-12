import {NextResponse} from "next/server";
import {listSandboxInvoices,readSandboxInvoice,SandboxError} from "../../../server/paypal-sandbox.ts";
import {normalizeSandboxInvoice} from "../../../domain/paypal-evidence.ts";
import {requireLocalRequest} from "../../../server/local-request.ts";
import {importSandboxInvoice,readWorkspace} from "../../../server/store.ts";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
export async function POST(request:Request) {
  try{requireLocalRequest(request,true);}catch{return NextResponse.json({error:"Sandbox access is limited to this local app."},{status:403,headers});}
  let input;
  try{const text=await request.text();if(text.length>1000)throw new Error();input=JSON.parse(text);if(!input||typeof input!=="object"||Array.isArray(input))throw new Error();}catch{return NextResponse.json({error:"Choose a valid sandbox read."},{status:400,headers});}
  if(!["refresh","invoice","import"].includes(input.action))return NextResponse.json({error:"Only sandbox invoice reads and local linking are supported."},{status:400,headers});
  if(input.action!=="refresh"&&(typeof input.invoiceId!=="string"||!/^INV2-[A-Z0-9-]{1,25}$/i.test(input.invoiceId)))return NextResponse.json({error:"Choose a valid PayPal invoice."},{status:400,headers});
  const credentials={clientId:process.env.PAYPAL_SANDBOX_CLIENT_ID??"",clientSecret:process.env.PAYPAL_SANDBOX_CLIENT_SECRET??""};
  if(!credentials.clientId||!credentials.clientSecret)return NextResponse.json({error:"Sandbox credentials have not been configured locally."},{status:503,headers});
  try {
    if(input.action==="import"){await importSandboxInvoice(input.invoiceId);return NextResponse.json({workspace:readWorkspace()},{headers});}
    if(input.action==="invoice"){
      const evidence=await readSandboxInvoice(input.invoiceId,credentials);
      return NextResponse.json({invoice:normalizeSandboxInvoice(evidence.raw,evidence.checkedAt)},{headers});
    }
    return NextResponse.json(await listSandboxInvoices(credentials),{headers});
  }catch(error){return NextResponse.json({error:error instanceof SandboxError?error.message:"PayPal returned invoice evidence that could not be verified."},{status:502,headers});}
}
