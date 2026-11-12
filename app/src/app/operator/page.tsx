import {headers} from "next/headers";
import {notFound} from "next/navigation";
import {requireLocalHeaders} from "../../server/local-request.ts";
import {readWorkspace} from "../../server/store.ts";
import OperatorSetup from "./operator-setup.tsx";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export default async function OperatorPage(){
  try{requireLocalHeaders(await headers());}catch{notFound();}
  return <OperatorSetup initial={readWorkspace()}/>;
}
