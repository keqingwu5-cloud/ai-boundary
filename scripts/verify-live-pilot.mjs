/** STRICT public site check. A 404, stale manifest or asset mismatch is NO_GO. */
import {sha256,ASSET_PATHS,SHA40} from './build-isolated-pilot.mjs';
const EXPECTED_HOST='keqingwu5-cloud.github.io';
const BASE_PATH='/ai-boundary/';
function validateAddress(value){
  const u=new URL(value);
  if(u.protocol!=='https:'||u.hostname!==EXPECTED_HOST||u.username||u.password||u.port||u.pathname!==BASE_PATH||u.search||u.hash)throw Error('UNTRUSTED_URL');
  return u;
}
async function readPinned(fetchImpl,url){
  const r=await fetchImpl(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(r.status!==200)throw Error(`HTTP_${r.status}`);
  const buf=Buffer.from(await r.arrayBuffer());
  if(buf.length>1024*1024)throw Error('RESPONSE_TOO_LARGE');
  return buf;
}
export async function verifyPublishedPilot({baseUrl,expectedSha,fetchImpl=fetch}={}) {
  try {
    if(!SHA40.test(expectedSha||''))throw Error('PINNED_SHA_REQUIRED');
    const u=validateAddress(baseUrl);
    const manifestBuf=await readPinned(fetchImpl,new URL('pilot-manifest.json',u));
    let m;try{m=JSON.parse(manifestBuf.toString('utf8'));}catch{throw Error('MANIFEST_JSON_INVALID');}
    if(m.schema!=='firstbrain.synthetic-public-preview.v0.4'||m.source_head!==expectedSha||m.authority!=='none'||m.production_writes!==false||m.external_api!==false||m.memory_approval!=='NOT_APPROVED'||m.real_ack!=='NOT_VERIFIED'||m.actual_execution!=='NOT_EXECUTED'||m.source_git_tree_matched!==true)throw Error('MANIFEST_VERSION_OR_AUTHORITY_MISMATCH');
    if(!Array.isArray(m.assets)||m.assets.length!==ASSET_PATHS.length||m.assets.some((a,i)=>a?.path!==ASSET_PATHS[i]||typeof a.sha256!=='string'||!/^[a-f0-9]{64}$/.test(a.sha256)||!Number.isSafeInteger(a.bytes)))throw Error('MANIFEST_ASSET_LIST_INVALID');
    for(const asset of m.assets){
      const buf=await readPinned(fetchImpl,new URL(asset.path,u));
      if(buf.length!==asset.bytes||sha256(buf)!==asset.sha256)throw Error(`ASSET_DIGEST_MISMATCH:${asset.path}`);
    }
    return {status:'LIVE_STATIC_HASH_VERIFIED',decision:'HOLD',source_head:expectedSha,asset_count:m.assets.length,production_ready:false,real_ack:'NOT_VERIFIED'};
  }catch(error){return {status:'LIVE_NO_GO',decision:'HOLD',reason:String(error?.message||error),production_ready:false};}
}
if(process.argv[1]&&process.argv[1].endsWith('verify-live-pilot.mjs')){
  const a=process.argv;
  const result=await verifyPublishedPilot({baseUrl:a[a.indexOf('--url')+1],expectedSha:a[a.indexOf('--expected-sha')+1]});
  process.stdout.write(JSON.stringify(result)+'\n');
  if(result.status!=='LIVE_STATIC_HASH_VERIFIED')process.exitCode=1;
}