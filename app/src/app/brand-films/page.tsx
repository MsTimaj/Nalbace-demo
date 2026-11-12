import {headers} from "next/headers";
import {notFound} from "next/navigation";
import {requireLocalHeaders} from "../../server/local-request.ts";
export const dynamic="force-dynamic";
export default async function BrandFilms(){
  try{requireLocalHeaders(await headers());}catch{notFound();}
  return <main className="app-shell"><a className="back" href="/">Back to workspace</a><h1>Nalbace in motion</h1><p>The light film introduces the app. Both approved films are saved here to play whenever you like.</p>{(["light","dark"] as const).map(style=><section className="card" key={style}><h2>{style==="light"?"Light · app splash":"Dark · brand film"}</h2><video src={`/brand-motion/nalbace-${style}.mp4`} poster={`/brand-motion/nalbace-${style}.jpg`} controls muted playsInline preload="none" style={{display:"block",width:"100%",maxHeight:"65svh",borderRadius:16}} aria-label={`${style} Nalbace brand film`}/></section>)}</main>;
}
