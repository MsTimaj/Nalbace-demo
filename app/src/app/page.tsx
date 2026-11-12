import Workspace from "./workspace.tsx";
import BrandSplash from "./brand-splash.tsx";
import { readWorkspace } from "../server/store.ts";
import {headers} from "next/headers";
import {notFound} from "next/navigation";
import {requireLocalHeaders} from "../server/local-request.ts";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export default async function Page(){
  const incoming=await headers();
  try{requireLocalHeaders(incoming);}catch{notFound();}
  return <BrandSplash><Workspace initial={readWorkspace()}/></BrandSplash>;
}
