/** Build an explicit allowlist-only synthetic preview package. No deploy or network. */
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,copyFile,lstat,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const MODULE_DIR=path.dirname(fileURLToPath(import.meta.url));
export const ASSET_PATHS=Object.freeze([
  'index.html','preview/index.html','preview/app.mjs','preview/pilot-core.mjs',
  'preview/chess.html','preview/chess-app.mjs','preview/chess-core.mjs',
  'nary-composition.mjs','nary-transform.mjs','gap-aware-composition.mjs','world-chess-lineage.mjs'
]);
export const sha256=buffer=>createHash('sha256').update(buffer).digest('hex');
export const SHA40=/^[0-9a-f]{40}$/;
const LANDING=`<!doctype html><html lang="zh-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; object-src 'none'"><title>第一大腦｜隔離試用</title><style>body{background:#111a29;color:#e7f4ff;font-family:system-ui;padding:30px;max-width:720px;margin:auto}a{color:#9dcaff}</style></head><body><h1>第一大腦｜隔離試用</h1><p>僅供合成資料研究，沒有任何正式主腦、記憶寫入、跨 AI ACK 或部署批准能力。請勿輸入私人資料。</p><p><a href="./preview/index.html">N-ary 型別與空白預覽</a></p><p><a href="./preview/chess.html">世界如棋局分支溯源預覽</a></p></body></html>`;
function assertUnderRoot(projectRoot,p) {const abs=path.resolve(projectRoot,p); if(!abs.startsWith(path.resolve(projectRoot)+path.sep))throw Error('PATH_ESCAPE');return abs;}
/** Caller must pin an exact version SHA; otherwise refuse to label an artifact. */
export async function buildRelease({projectRoot=path.resolve(MODULE_DIR,'..'),outDir,sourceSha}={}){
  if(typeof sourceSha!=='string'||!SHA40.test(sourceSha))throw Error('SOURCE_SHA_REQUIRED');
  if(typeof outDir!=='string'||!outDir.length)throw Error('OUTPUT_DIRECTORY_REQUIRED');
  const out=path.resolve(outDir);
  if(out===path.resolve(projectRoot)||out.startsWith(path.resolve(projectRoot,'preview')+path.sep))throw Error('OUTPUT_INVALID');
  await mkdir(out,{recursive:false});
  const assets=[];
  for(const name of ASSET_PATHS){
    const dest=assertUnderRoot(out,name);
    await mkdir(path.dirname(dest),{recursive:true});
    if(name==='index.html')await writeFile(dest,LANDING,'utf8');
    else{
      const src=assertUnderRoot(projectRoot,name),info=await lstat(src);
      if(!info.isFile()||info.isSymbolicLink())throw Error('UNSAFE_SOURCE_FILE:'+name);
      await copyFile(src,dest);
    }
    const content=await readFile(dest);
    if(content.length>1024*1024)throw Error('ASSET_TOO_LARGE:'+name);
    assets.push({path:name,sha256:sha256(content),bytes:content.length});
  }
  const manifest={schema:'firstbrain.synthetic-public-preview.v0.4',source_repository:'keqingwu5-cloud/ai-boundary',source_head:sourceSha,
    scope:'GH_PAGES_ISOLATED_CANDIDATE',data:'SYNTHETIC_ONLY',authority:'none',memory_approval:'NOT_APPROVED',real_ack:'NOT_VERIFIED',
    actual_execution:'NOT_EXECUTED',production_writes:false,external_api:false,credentials:false,source_independently_verified:false,
    assets};
  await writeFile(path.join(out,'pilot-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  const finalFiles=await readdir(out,{recursive:true});
  const actualFiles=finalFiles.filter(x=>!x.endsWith('/') && ASSET_PATHS.includes(x));
  if(actualFiles.length!==ASSET_PATHS.length)throw Error('ASSET_COUNT_MISMATCH');
  return Object.freeze(manifest);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const opt={};for(let i=2;i<process.argv.length;i+=2)opt[process.argv[i]]=process.argv[i+1];
  try{const manifest=await buildRelease({outDir:opt['--out'],sourceSha:opt['--source-sha']});process.stdout.write(`ISOLATED_PACKAGE_CREATED source_sha=${manifest.source_head} assets=${manifest.assets.length} approval=NOT_APPROVED\n`);}catch(e){process.stderr.write(`BUILD_BLOCKED ${e.message}\n`);process.exitCode=1;}
}