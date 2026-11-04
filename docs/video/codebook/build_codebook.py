#!/usr/bin/env python3
"""影片代碼簿產生器（可重跑）。只讀取，不搬動/改名任何影片。
用法：python3 build_codebook.py   → 輸出 video_codebook.md / video_codebook.csv
新增主題或節點：改下方 EP_META / LAB_META / OBJ_META。"""
import csv, json, os, re, subprocess, time, datetime as dt
from pathlib import Path
ROOT = Path('/workspace/影像導演'); S = ROOT/'ai-boundary-series'; OUT = ROOT/'代碼簿'
TZ = dt.timezone(dt.timedelta(hours=8)); NOW = time.time()
SITE_REPO = Path('/workspace/ai-boundary/media/videos')
# 主題來源：srt 首句、drafts/ep0x_分鏡草稿.md、craft-cards/影片儲存方案.md（節點對照）
EP_META = {
 1: ('AI 在國際數學奧林匹亞拿金牌，就代表會推理嗎（推定，依 srt）', 'n_q1'),
 2: ('AI 一次只預測下一個字（依 srt）', 'n_q2'),
 3: ('讀過的資料比人多、題型接得快又準（依 srt）', 'n_q3'),
 4: ('說得流暢就代表真的懂嗎（依 srt）', 'n_q4'),
 5: ('深夜對 AI 說心裡話：溫柔回應與安慰（依 srt）', 'n_q5'),
 6: ('連打造者都看不懂 AI 內部在想什麼（依 srt）', 'n_q6'),
 7: ('主腦的構想：從方向拆成問題的工作流（依 srt）', '待確認'),
 8: ('BOT 只是名稱嗎？真正的工作單位是可替換的能力（依分鏡草稿）', '待確認'),
 9: ('想法到實作的時間差，才是長期競爭重點（依分鏡草稿）', 'n_x_20261021_idea'),
}
LAB_META = {'A': '第一顆腦（first brain，依檔名）', 'B': '監視器（monitor，依檔名）', 'C': '看不見的網（invisible net，依檔名）'}
OBJ_ORDER = ['mazu', 'u1_scooter', 'u5_containership_ref', 'u6_fishingboat', 'u8_piano_ref', 'u9_corridor_ref']
OBJ_META = {'mazu': '媽祖像 轉台', 'u1_scooter': '機車（取自 U1）轉台', 'u5_containership_ref': '貨櫃輪（參考 U5）轉台',
            'u6_fishingboat': '漁船（取自 U6）轉台', 'u8_piano_ref': '鋼琴（參考 U8）轉台', 'u9_corridor_ref': '走廊（參考 U9）轉台'}

def probe(p):
    r = subprocess.run(['ffprobe','-v','error','-print_format','json','-show_streams','-show_format',str(p)],capture_output=True,text=True)
    try: j = json.loads(r.stdout)
    except Exception: return {}
    v = next((s for s in j.get('streams',[]) if s.get('codec_type')=='video'), {})
    subs = any(s.get('codec_type')=='subtitle' for s in j.get('streams',[]))
    fr = v.get('avg_frame_rate') or v.get('r_frame_rate') or '0/1'
    try: n,d = fr.split('/'); fps = round(float(n)/float(d),3) if float(d) else 0
    except Exception: fps = ''
    dur = j.get('format',{}).get('duration')
    return {'res': f"{v.get('width')}x{v.get('height')}" if v else '', 'fps': fps,
            'dur': round(float(dur),2) if dur else '', 'substream': subs}

def ctime(p):
    st = os.stat(p); t = getattr(st,'st_birthtime',None) or st.st_mtime
    return dt.datetime.fromtimestamp(t,TZ).strftime('%Y-%m-%d %H:%M')

def md5(p):
    import hashlib; h=hashlib.md5()
    with open(p,'rb') as f:
        for b in iter(lambda: f.read(1<<20), b''): h.update(b)
    return h.hexdigest()

def rel(p): return str(p) if p else '—'
def first(*ps):
    ex=[str(p) for p in ps if p and Path(p).exists()]; return '；'.join(ex) if ex else '—'

rows=[]
def add(code, cat, title, node, path, burned, srt, cover, status, note=''):
    r={'代碼':code,'類別':cat,'標題/主題':title,'節點id':node or '—','檔案路徑':rel(path),
       '解析度':'','fps':'','長度(秒)':'','大小(MB)':'','燒字幕':burned,'對應srt':srt,'封面':cover,
       '建立時間(台北)':'','狀態':status,'備註':note}
    if path and Path(path).exists():
        i=probe(path); r.update({'解析度':i.get('res',''),'fps':i.get('fps',''),'長度(秒)':i.get('dur',''),
           '大小(MB)':round(Path(path).stat().st_size/1e6,1),'建立時間(台北)':ctime(path)})
        if i.get('substream'): r['備註']=(r['備註']+'；含軟字幕軌').strip('；')
    rows.append(r)

def hq_state(e):
    w=S/f'ep{e:02d}_60s_hq_work'; log=S/'batch_hq'/'batch.log'
    if (w/'all.done').exists(): return 'done'
    lg=log.read_text(errors='ignore') if log.exists() else ''
    if f'ep{e:02d} postpro start' in lg or f'ep{e:02d} feed' in lg: return 'wip'
    return 'manual' if w.exists() else None

def fresh(p): return Path(p).exists() and NOW-Path(p).stat().st_mtime<180

site_md5={}
if SITE_REPO.exists():
    for f in SITE_REPO.glob('*.mp4'): site_md5[md5(f)]=f.stem

# ---- 系列 ----
eps=sorted({int(m.group(1)) for f in S.glob('ep*') if (m:=re.match(r'ep(\d+)',f.name))})
for e in eps:
    t,node=EP_META.get(e,('待確認','待確認'))
    srt=first(S/f'ep{e:02d}_60s.srt', S/f'ep{e:02d}.zh-TW.srt'); cov=first(S/f'ep{e:02d}_poster.jpg')
    hs=hq_state(e); any_file=False
    variants=[('',f'ep{e:02d}_60s.mp4','是'),('-CLEAN',f'ep{e:02d}_60s_clean.mp4','否'),
              ('-HQ',f'ep{e:02d}_60s_hq.mp4','是'),('-HQ-CLEAN',f'ep{e:02d}_60s_hq_clean.mp4','否'),
              ('-FEED',f'ep{e:02d}_60s_hq_feed.mp4','是'),('-MOBILE',f'ep{e:02d}_60s_hq_mobile.mp4','是（推定，由 HQ 燒字幕版轉出）')]
    for suf,fn,burn in variants:
        p=S/fn
        if not p.exists(): continue
        any_file=True; note=''
        if '-HQ' in suf or suf in('-FEED','-MOBILE'):
            if hs=='wip' or fresh(p): st='製作中'; note='HQ 批次（batch_hq）尚未完成，檔案仍在寫入/未定稿'
            elif hs=='done': st='已交付'; note='batch_hq 完成（all.done）'
            else: st='試片'; note='HQ 手動製作、無批次完成標記，交付狀態待確認'
            if hs is None and e==1: st='已交付'; note='ep01 HQ 由 /workspace/ep01_hq 製作（待確認是否已交付）'
        else:
            if node.startswith('n_q'): st='已交付'; note=f'網站節點 {node} 的來源母片（網站版為 720 寬壓縮檔）'
            else: st='試片'; note='未見於網站 repo media/，交付狀態待確認'
        if site_md5.get(md5(p)): st='已交付'; note=f'與網站 {site_md5[md5(p)]}.mp4 完全相同'
        add(f'EP{e:02d}{suf}','系列',t,node,p,burn,srt,cov,st,note)
    if (S/f'ep{e:02d}.mp4').exists():
        add(f'EP{e:02d}-V0','系列',t,node,S/f'ep{e:02d}.mp4','待確認','—','—','舊版','早期短版（約 10 秒）')
    if (S/f'ep{e:02d}_rejected_v1.mp4').exists():
        add(f'EP{e:02d}-REJ','系列',t,node,S/f'ep{e:02d}_rejected_v1.mp4','待確認','—','—','舊版','退件 v1')
    if not any_file and not (S/f'ep{e:02d}.mp4').exists():
        add(f'EP{e:02d}','系列',t,node,None,'—',srt,cov,'製作中',f'尚無成品，只有分鏡片段 ep{e:02d}_60s_work/')
    if hs is None and (S/f'ep{e:02d}_60s_clean.mp4').exists() and 2<=e<=7 and not (S/f'ep{e:02d}_60s_hq.mp4').exists():
        add(f'EP{e:02d}-HQ','系列',t,node,None,'—',srt,cov,'製作中','HQ 版尚未產出（batch_hq 排程 EP02–07）')
for p,code,t in [(S/'series_ep01-06.mp4','EP01-06-ALL','EP01–06 合輯'),(S/'compare_ep01.mp4','EP01-CMP','EP01 標準版 vs HQ 比較片'),(S/'compare_ep08.mp4','EP08-CMP','EP08 標準版 vs HQ 比較片')]:
    if p.exists(): add(code,'系列',t,'—',p,'待確認','—','—','試片' if 'CMP' in code else '舊版','合輯由 list.txt 串接早期短版 ep01–06' if 'ALL' in code else '比較用')
# ---- 番外 ----
L=ROOT/'語言是不是思考的邊界'/'output'
for fn,code,burn,st,srt in [('語言是不是思考的邊界_v2_字幕版.mp4','SP-LANG','是','已交付','subtitles_v2.zh-TW.srt'),
                            ('語言是不是思考的邊界_v2_無字幕.mp4','SP-LANG-CLEAN','否','已交付','subtitles_v2.zh-TW.srt'),
                            ('語言是不是思考的邊界_字幕版.mp4','SP-LANG-V1','是','舊版','subtitles.zh-TW.srt')]:
    p=L/fn
    if p.exists():
        n='網站 n_x_language 為 v2（56s）'
        if site_md5.get(md5(p)): n=f'與網站 {site_md5[md5(p)]}.mp4 完全相同'
        add(code,'番外','語言是不是思考的邊界','n_x_language',p,burn,first(L/srt),first(ROOT/'語言是不是思考的邊界'/'contact_sheet.png').replace('—','—'),st,n)
# ---- 實驗片 ----
for lab in sorted(ROOT.glob('lab0*')):
    n=lab.name[-2:]
    for p in sorted(lab.glob('lab*_[A-Z]_*.mp4')):
        k=re.match(r'lab\d+_([A-Z])_',p.name).group(1)
        add(f'LAB{n}-{k}','實驗片',LAB_META.get(k,'待確認'),'—',p,'否（推定）','—',first(p.with_name(p.stem+'_sheet.png')),'試片','接續片段 '+k.lower()+'1+'+k.lower()+'2')
    for p in sorted((lab/'v1').glob('lab*_[A-Z]_*.mp4')) if (lab/'v1').exists() else []:
        k=re.match(r'lab\d+_([A-Z])_',p.name).group(1)
        add(f'LAB{n}-{k}-V1','實驗片',LAB_META.get(k,'待確認'),'—',p,'否（推定）','—','—','舊版','v1 版')
# ---- 物件轉台 ----
objs=sorted((ROOT/'lab02').glob('*_turntable.mp4'),key=lambda p:(OBJ_ORDER.index(p.name[:-14]) if p.name[:-14] in OBJ_ORDER else 99,p.name))
for i,p in enumerate(objs,1):
    k=p.name[:-14]
    add(f'OBJ-{i:02d}','物件轉台',OBJ_META.get(k,'待確認'),'—',p,'否','—',first(p.with_name(k+'_4view.png'),p.with_name(k+'_turntable_contact.png')),'試片','lab02 四視圖轉台')
# ---- 使用者素材 ----
for p in sorted((ROOT/'user-footage').iterdir()):
    m=re.fullmatch(r'u(\d+)\.(mp4|mov)',p.name,re.I)
    if m: add(f'U{m.group(1)}','使用者素材','待確認（使用者提供原始素材）','—',p,'待確認','—','—','已交付','使用者提供素材（狀態欄僅表示已收到）')

cols=list(rows[0].keys())
with open(OUT/'video_codebook.csv','w',newline='',encoding='utf-8-sig') as f:
    w=csv.DictWriter(f,fieldnames=cols); w.writeheader(); w.writerows(rows)
def tbl(rs):
    s='| '+' | '.join(cols)+' |\n|'+'---|'*len(cols)+'\n'
    for r in rs: s+='| '+' | '.join(str(r[c]).replace('|','\\|').replace(str(ROOT)+'/','') for c in cols)+' |\n'
    return s
from collections import Counter
md=[f'# 影片代碼簿\n\n產生時間：{dt.datetime.now(TZ):%Y-%m-%d %H:%M}（台北時間）｜由 `代碼簿/build_codebook.py` 自動產生，請勿手改；路徑相對於 `/workspace/影像導演/`。\n',
    f'總筆數 **{len(rows)}**；'+'、'.join(f'{k} {v}' for k,v in Counter(r['類別'] for r in rows).items())+'；狀態：'+'、'.join(f'{k} {v}' for k,v in Counter(r['狀態'] for r in rows).items())+'\n',
    '代碼規則：EPnn＝60 秒燒字幕標準版；-CLEAN 無字幕；-HQ 1080x1920 母帶；-HQ-CLEAN；-FEED 網站/動態用；-MOBILE 手機壓縮；-V0 早期短版；-REJ 退件；-CMP 比較片；SP-* 番外；LABnn-X 實驗片；OBJ-nn 物件轉台；Un 使用者素材。\n',
    '排除：`*_work/`、`hq_work`、lab01 a1/a2/b1/b2/c1/c2 分鏡片段、clips/、stock-library、sound-library、tools。\n']
for cat in ['系列','番外','實驗片','物件轉台','使用者素材']:
    rs=[r for r in rows if r['類別']==cat]
    if rs: md.append(f'\n## {cat}（{len(rs)}）\n\n'+tbl(rs))
pend=[r['代碼'] for r in rows if '待確認' in ' '.join(map(str,r.values()))]
md.append('\n## 待確認\n\n'+'、'.join(pend)+'\n')
(OUT/'video_codebook.md').write_text(''.join(md),encoding='utf-8')
print(len(rows), Counter(r['類別'] for r in rows), Counter(r['狀態'] for r in rows)); print('待確認:',pend)
