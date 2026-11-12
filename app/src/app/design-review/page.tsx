import {headers} from "next/headers";
import {notFound} from "next/navigation";
import {requireLocalHeaders} from "../../server/local-request.ts";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export default async function DesignReview(){
  try{requireLocalHeaders(await headers());}catch{notFound();}
  return <div className="app-shell"><header className="brand"><img src="/nalbace-app-icon.svg?v=silver-1" alt=""/><span>Nalbace</span><span className="mode">APPROVED BRAND</span></header><main><a className="back" href="/">Back to workspace</a><h1>A touch of silver</h1><p className="intro">The same blue, green and continuous loop, with a restrained metallic edge.</p><section className="card"><img src="/design-review/silver-combined.svg" width="960" height="680" style={{width:"100%",height:"auto"}} alt="Approved Nalbace logo with silver around the mark and app tile, shown large and at three smaller sizes."/><p className="hint">The silver-bordered tile is used in the small app header, browser tab and phone shortcut. The standalone silver-edged mark remains available for documents and larger placements.</p></section></main></div>;
}
