"use strict";
/* Deployment PRE-FLIGHT ONLY; never deploys, writes vault data, or sends secrets.
 * Designed for externally supplied, OWNER-APPROVED PRIVATE host URLs. The
 * verifier does a read-only anonymous GET; it is NOT a full security audit. */
const {URL}=require("node:url");
const net=require("node:net");
const BLOCKED="RELEASE_BLOCKED";
function parseUrl(value,kind){
 if(typeof value!=="string"||!value.trim())throw Error(kind+"_url_required");
 let u;
 try{u=new URL(value);}catch(_){throw Error(kind+"_url_invalid");}
 if(u.username||u.password||u.search||u.hash)throw Error(kind+"_url_credentials_or_query_forbidden");
 if(!["https:","http:"].includes(u.protocol))throw Error(kind+"_url_scheme_forbidden");
 return u;
}
function isLoopback(u){
 return ["localhost","127.0.0.1","::1","[::1]"].includes(u.hostname)
   || net.isIP(u.hostname)===4&&u.hostname.startsWith("127.");
}
function origins(privateUrl,publicUrl,{syntheticLoopback=false}={}){
 const p=parseUrl(privateUrl,"private"),q=parseUrl(publicUrl,"public");
 const synthetic=syntheticLoopback&&isLoopback(p)&&isLoopback(q);
 if(!synthetic&&(p.protocol!=="https:"||q.protocol!=="https:"))
   throw Error("https_required_for_private_and_public");
 if(p.hostname.toLowerCase()===q.hostname.toLowerCase())
   throw Error("private_hostname_must_differ_from_public");
 if(p.protocol==="https:"&&p.port&&p.port!=="443")
   throw Error("private_unusual_port_requires_review");
 if(!["/","/memory.html","/index.html"].includes(p.pathname))
   throw Error("private_page_not_bundle_entrypoint");
 return {privateOrigin:p.origin,publicOrigin:q.origin,syntheticOnly:synthetic,privateUrl:p.toString()};
}
function header(headers,name){
 if(headers&&typeof headers.get==="function")return headers.get(name)||"";
 if(!headers||typeof headers!=="object")return "";
 return Object.entries(headers).find(([k])=>k.toLowerCase()===name.toLowerCase())?.[1]||"";
}
function directives(raw){
 const map=new Map();
 for(const part of raw.split(";")){
  const words=part.trim().split(/\s+/).filter(Boolean);
  if(!words.length)continue;
  const name=words.shift().toLowerCase();
  if(map.has(name))throw Error("duplicate_csp_directive_"+name);
  map.set(name,words);
 }
 return map;
}
function inspect({privateUrl,publicUrl,status=200,headers={},syntheticLoopback=false}){
 const checks={};
 let site;
 try{site=origins(privateUrl,publicUrl,{syntheticLoopback});checks.origin="PASS";}
 catch(e){checks.origin=e.message;return {result:BLOCKED,checks,blocking:[e.message],syntheticOnly:false};}
 const blocking=[];
 const must=(ok,key,reason)=>{checks[key]=ok?"PASS":"FAIL";if(!ok)blocking.push(reason);};
 must(status===200,"status","private_page_not_http_200");
 const ct=String(header(headers,"content-type")).toLowerCase();
 must(/^text\/html(?:\s*;|\s*$)/.test(ct),"contentType","private_html_mime_invalid");
 must(String(header(headers,"x-content-type-options")).toLowerCase().trim()==="nosniff","nosniff","nosniff_header_missing");
 must(String(header(headers,"referrer-policy")).toLowerCase().split(",").some(x=>x.trim()==="no-referrer"),"referrer","referrer_policy_not_strict");
 must(/(?:^|,)\s*no-store\s*(?:,|$)/i.test(String(header(headers,"cache-control"))),"cache","private_page_must_not_be_cached");
 must(!header(headers,"set-cookie"),"cookies","private_page_must_not_set_cookies");
 must(!header(headers,"access-control-allow-origin"),"cors","private_page_must_not_expose_cors");
 must(String(header(headers,"cross-origin-resource-policy")).toLowerCase().trim()==="same-origin","corp","private_cross_origin_resource_policy_missing");
 const csp=String(header(headers,"content-security-policy"));
 let d;
 try{d=directives(csp);}
 catch(e){blocking.push(e.message);checks.csp="FAIL";}
 if(!d){if(checks.csp!=="FAIL"){checks.csp="FAIL";blocking.push("http_csp_header_missing");}}
 else{
  checks.csp="PASS";
  for(const [name,values] of Object.entries({
   "default-src":["'none'"],"script-src":["'self'"],"connect-src":["'none'"],
   "img-src":["'none'"],"object-src":["'none'"],"base-uri":["'none'"],
   "form-action":["'none'"],"frame-ancestors":["'none'"]})){
   const actual=d.get(name);
   must(!!actual&&actual.length===values.length&&actual.every((v,i)=>v===values[i]),
      "csp:"+name,"unsafe_or_missing_csp_"+name);
  }
 }
 if(!site.syntheticOnly){
  const sts=String(header(headers,"strict-transport-security")).toLowerCase();
  const age=sts.match(/(?:^|;)\s*max-age=(\d+)/);
  must(!!age&&Number(age[1])>=86400,"hsts","hsts_missing_or_too_short");
 }else checks.hsts="SYNTHETIC_ONLY_NOT_ASSESSED";
 return {result:blocking.length?BLOCKED:"HOST_HEADERS_PASS_NOT_RELEASE_APPROVAL",
   checks,blocking,syntheticOnly:site.syntheticOnly,
   privateOrigin:site.privateOrigin,publicOrigin:site.publicOrigin};
}
async function inspectRemote(privateUrl,publicUrl,{fetchImpl=globalThis.fetch,
 syntheticLoopback=false,timeoutMs=8000}={}){
 const site=origins(privateUrl,publicUrl,{syntheticLoopback});
 if(typeof fetchImpl!=="function")throw Error("fetch_not_available");
 const res=await fetchImpl(site.privateUrl,{
   method:"GET",redirect:"manual",credentials:"omit",cache:"no-store",
   signal:AbortSignal.timeout(timeoutMs)});
 try{return inspect({privateUrl,publicUrl,status:res.status,headers:res.headers,syntheticLoopback});}
 finally{if(res.body&&typeof res.body.cancel==="function")await res.body.cancel();}
}
if(require.main===module){
 const argv=process.argv.slice(2);
 const val=(flag)=>{const i=argv.indexOf(flag);return i<0?null:argv[i+1];};
 const priv=val("--private-url"),pub=val("--public-url");
 if(!priv||!pub){process.stderr.write("Usage: node scripts/check-memory-private-origin.cjs --private-url https://PRIVATE_HOST/memory.html --public-url https://PUBLIC_HOST/\n");process.exitCode=2;}
 else inspectRemote(priv,pub).then(x=>{
   process.stdout.write(JSON.stringify(x,null,2)+"\n");
   if(x.blocking.length)process.exitCode=1;
 }).catch(e=>{process.stderr.write("PRE-FLIGHT BLOCKED: "+e.message+"\n");process.exitCode=1;});
}
module.exports={origins,inspect,inspectRemote};
