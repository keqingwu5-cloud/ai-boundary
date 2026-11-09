import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,symlink,unlink,stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';import os from 'node:os';
import {buildRelease,ASSET_PATHS,sha256} from '../scripts/build-isolated-pilot.mjs';
import {verifyPublishedPilot} from '../scripts/verify-live-pilot.mjs';
const PUBLIC_URL='https://keqingwu5-cloud.github.io/ai-boundary/';

function git(dir,...args){return execFileSync('git',['-C',dir,...args],{encoding:'utf8'}).trim();}
async function setup(){
  const dir=await mkdtemp(path.join(os.tmpdir(),'firstbrain-candidate-'));
  for(const p of ASSET_PATHS.filter(x=>x!=='index.html')){
    const file=path.join(dir,p);
    await mkdir(path.dirname(file),{recursive:true});
    await writeFile(file,'synthetic '+p);
  }
  await mkdir(path.join(dir,'scripts'),{recursive:true});
  const builder=await readFile(new URL('../scripts/build-isolated-pilot.mjs',import.meta.url));
  await writeFile(path.join(dir,'scripts','build-isolated-pilot.mjs'),builder);
  execFileSync('git',['init','-q','-b','main',dir]);
  git(dir,'add','--','scripts/build-isolated-pilot.mjs',...ASSET_PATHS.filter(x=>x!=='index.html'));
  git(dir,'-c','user.name=Synthetic Fixture','-c','user.email=fixture@example.invalid','commit','-q','-m','synthetic test repo');
  return {dir,sha:git(dir,'rev-parse','HEAD')};
}
async function fixture(){
  const {dir,sha}=await setup();
  const out=path.join(dir,'release');
  const m=await buildRelease({projectRoot:dir,outDir:out,sourceSha:sha});
  const blobs=new Map();
  for(const name of [...ASSET_PATHS,'pilot-manifest.json']){
    blobs.set('/ai-boundary/'+name,await readFile(path.join(out,name)));
  }
  const respond=async url=>{const buf=blobs.get(new URL(url).pathname);return {status:buf?200:404,arrayBuffer:async()=>buf??Buffer.alloc(0)};};
  return {dir,sha,out,m,blobs,respond};
}
test('P01 allowlist-only build records exact digest, version and nonauthority',async()=>{const f=await fixture();assert.equal(f.m.assets.length,ASSET_PATHS.length);assert.equal(f.m.authority,'none');assert.equal(f.m.source_head,f.sha);assert.equal(f.m.production_writes,false);const p=await readFile(path.join(f.out,'preview/chess.html'));assert.equal(f.m.assets.find(a=>a.path==='preview/chess.html').sha256,sha256(p));});
test('P02 build fails without pinned SHA',async()=>{const {dir}=await setup();await assert.rejects(buildRelease({projectRoot:dir,outDir:path.join(dir,'x'),sourceSha:'UNKNOWN'}),/SOURCE_SHA_REQUIRED/);});
test('P03 symlink input is rejected',async()=>{const {dir,sha}=await setup();const target=path.join(dir,'preview','chess-app.mjs');await unlink(target);await symlink(path.join(dir,'preview/index.html'),target);await assert.rejects(buildRelease({projectRoot:dir,outDir:path.join(dir,'x'),sourceSha:sha}),/UNSAFE_SOURCE_FILE/);});
test('P04 live verifier checks every public asset',async()=>{const f=await fixture();const r=await verifyPublishedPilot({baseUrl:PUBLIC_URL,expectedSha:f.sha,fetchImpl:f.respond});assert.equal(r.status,'LIVE_STATIC_HASH_VERIFIED');assert.equal(r.production_ready,false);});
test('P05 public 404 is a hard NO_GO',async()=>{const f=await fixture();const r=await verifyPublishedPilot({baseUrl:PUBLIC_URL,expectedSha:f.sha,fetchImpl:async()=>({status:404})});assert.equal(r.status,'LIVE_NO_GO');assert.equal(r.reason,'HTTP_404');});
test('P06 stale version blocks claimed release',async()=>{const f=await fixture();const r=await verifyPublishedPilot({baseUrl:PUBLIC_URL,expectedSha:'b'.repeat(40),fetchImpl:f.respond});assert.equal(r.reason,'MANIFEST_VERSION_OR_AUTHORITY_MISMATCH');});
test('P07 tampered file blocks proof',async()=>{const f=await fixture();f.blobs.set('/ai-boundary/preview/chess.html',Buffer.from('tampered'));const r=await verifyPublishedPilot({baseUrl:PUBLIC_URL,expectedSha:f.sha,fetchImpl:f.respond});assert.match(r.reason,/ASSET_DIGEST_MISMATCH/);});
test('P08 external URL cannot be probed',async()=>{const r=await verifyPublishedPilot({baseUrl:'https://example.com/',expectedSha:'a'.repeat(40),fetchImpl:()=>{throw Error('must not call fetch');}});assert.equal(r.reason,'UNTRUSTED_URL');});
test('P09 malicious relative base path cannot change scope',async()=>{const r=await verifyPublishedPilot({baseUrl:'https://keqingwu5-cloud.github.io/',expectedSha:'a'.repeat(40)});assert.equal(r.reason,'UNTRUSTED_URL');});
test('P10 manifests cannot grant approval',async()=>{const f=await fixture();const p='/ai-boundary/pilot-manifest.json';const m=JSON.parse(f.blobs.get(p).toString());m.memory_approval='APPROVED';f.blobs.set(p,Buffer.from(JSON.stringify(m)));const r=await verifyPublishedPilot({baseUrl:PUBLIC_URL,expectedSha:f.sha,fetchImpl:f.respond});assert.equal(r.reason,'MANIFEST_VERSION_OR_AUTHORITY_MISMATCH');});
test('P11 valid-looking but incorrect commit SHA is refused',async()=>{
  const {dir}=await setup();
  await assert.rejects(buildRelease({projectRoot:dir,outDir:path.join(dir,'x'),sourceSha:'a'.repeat(40)}),/SOURCE_SHA_MISMATCH/);
});
test('P12 dirty asset cannot masquerade as HEAD',async()=>{
  const {dir,sha}=await setup();
  await writeFile(path.join(dir,'preview/chess.html'),'dirty');
  await assert.rejects(buildRelease({projectRoot:dir,outDir:path.join(dir,'x'),sourceSha:sha}),/SOURCE_ASSET_NOT_AT_HEAD/);
});
test('P13 staged change cannot masquerade as HEAD',async()=>{
  const {dir,sha}=await setup();
  await writeFile(path.join(dir,'preview/chess.html'),'staged');
  git(dir,'add','--','preview/chess.html');
  await assert.rejects(buildRelease({projectRoot:dir,outDir:path.join(dir,'x'),sourceSha:sha}),/SOURCE_ASSET_NOT_AT_HEAD/);
});
test('P14 still-present untracked file removed from HEAD is refused',async()=>{
  const {dir}=await setup();
  git(dir,'rm','-q','--cached','preview/chess.html');
  git(dir,'-c','user.name=Synthetic Fixture','-c','user.email=fixture@example.invalid','commit','-q','-m','remove asset from tree');
  const sha=git(dir,'rev-parse','HEAD');
  await assert.rejects(buildRelease({projectRoot:dir,outDir:path.join(dir,'x'),sourceSha:sha}),/SOURCE_FILE_NOT_IN_HEAD/);
});
test('P15 uncommitted builder cannot construct a purported pinned release',async()=>{
  const {dir,sha}=await setup();
  await writeFile(path.join(dir,'scripts/build-isolated-pilot.mjs'),'wrong build tool');
  await assert.rejects(buildRelease({projectRoot:dir,outDir:path.join(dir,'x'),sourceSha:sha}),/SOURCE_ASSET_NOT_AT_HEAD/);
});
test('P16 unrelated untracked content is not packaged',async()=>{
  const {dir,sha}=await setup();
  await writeFile(path.join(dir,'PRIVATE_SYNTHETIC_JUNK'),'not a secret');
  const out=path.join(dir,'release');
  const manifest=await buildRelease({projectRoot:dir,outDir:out,sourceSha:sha});
  assert.equal(manifest.source_git_tree_matched,true);
  await assert.rejects(stat(path.join(out,'PRIVATE_SYNTHETIC_JUNK')),/ENOENT/);
});
test('P17 checked-out subdirectory cannot be falsely claimed as repo root',async()=>{
  const {dir,sha}=await setup();
  await assert.rejects(buildRelease({projectRoot:path.join(dir,'preview'),outDir:path.join(dir,'x'),sourceSha:sha}),/SOURCE_GIT_ROOT_MISMATCH/);
});
test('P18 public verifier rejects legacy manifest without git-tree check',async()=>{
  const f=await fixture(),key='/ai-boundary/pilot-manifest.json';
  const m=JSON.parse(f.blobs.get(key).toString());
  delete m.source_git_tree_matched;
  f.blobs.set(key,Buffer.from(JSON.stringify(m)));
  const r=await verifyPublishedPilot({baseUrl:PUBLIC_URL,expectedSha:f.sha,fetchImpl:f.respond});
  assert.equal(r.reason,'MANIFEST_VERSION_OR_AUTHORITY_MISMATCH');
});
