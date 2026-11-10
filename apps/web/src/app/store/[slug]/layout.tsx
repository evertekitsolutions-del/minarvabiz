import type {Metadata} from "next";
type MetaStore={title:string;seo_title:string;seo_description:string;banner_url:string;published:boolean};
export async function generateMetadata({
 params
}:{params:Promise<{slug:string}>}):Promise<Metadata>{
 const {slug}=await params;
 const fallback:Metadata={title:"Minarva Biz Store",description:"Secure tenant product storefront"};
 if(!/^[a-z0-9][a-z0-9-]{2,46}[a-z0-9]$/.test(slug))return fallback;
 const base=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!base||!key)return fallback;
 try{
  const address=base.replace(/\/+$/,"")+"/rest/v1/saas_storefronts?"+
   new URLSearchParams({select:"title,seo_title,seo_description,banner_url,published",
    slug:"eq."+slug,published:"eq.true",limit:"1"});
  const headers:Record<string,string>={apikey:key,Accept:"application/json"};
  if(key.startsWith("eyJ"))headers.Authorization="Bearer "+key;
  const res=await fetch(address,{headers,cache:"no-store",signal:AbortSignal.timeout(3500)});
  if(!res.ok)return fallback;
  const list:MetaStore[]=await res.json();
  const shop=list[0];
  if(!shop?.published)return fallback;
  const title=shop.seo_title||shop.title;
  const description=shop.seo_description||"Browse GST-inclusive products and request an order.";
  const image=/^https:\/\/\S+$/.test(shop.banner_url||"")?shop.banner_url:undefined;
  return {title,description,openGraph:{title,description,...(image?{images:[image]}:{})}};
 }catch{return fallback;}
}
export default function PublicStoreLayout({children}:{children:React.ReactNode}){
 return children;
}
