import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"Nalbace · Your daily review",description:"A local sample workspace for invoice follow-up.",robots:{index:false,follow:false},icons:{icon:{url:"/nalbace-app-icon.svg",type:"image/svg+xml",sizes:"any"},apple:{url:"/nalbace-apple-icon.png",sizes:"180x180",type:"image/png"}}};
export default function Layout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
