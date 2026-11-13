import os, json, subprocess, pathlib, socket, time, tempfile
base=pathlib.Path(__file__).resolve().parents[2]
out=base/'evidence'; out.mkdir(exist_ok=True)
data=pathlib.Path(tempfile.mkdtemp(prefix='synthetic-data-',dir=out))
env={'PATH':os.environ['PATH'],'TESTENV_DATA_DIR':str(data),'TESTENV_HOST':'127.0.0.1','TESTENV_PORT':'19873','TESTENV_EXECUTOR_MODE':'MOCK'}
rows=[]; proc=None; log=None; completed=False
def boot(label):
    global proc, log
    log=(out/(label+'.log')).open('w')
    proc=subprocess.Popen(['node',str(base/'testenv/loop/server.cjs')],env=env,stdout=log,stderr=log)
    for _ in range(100):
        if proc.poll() is not None: raise RuntimeError('server exited: '+(out/(label+'.log')).read_text())
        try:
            with socket.create_connection(('127.0.0.1',19873),timeout=.1): return
        except OSError: time.sleep(.05)
    raise RuntimeError('server not ready')
def stop():
    global proc,log
    if proc is not None and proc.poll() is None:
        proc.terminate()
        try: proc.wait(timeout=4)
        except subprocess.TimeoutExpired: proc.kill();proc.wait()
    if log: log.close()
def command(label,args,expected=0):
    r=subprocess.run(['node',*args],env=env,capture_output=True,text=True,timeout=25)
    (out/(label+'.stdout')).write_text(r.stdout)
    (out/(label+'.stderr')).write_text(r.stderr)
    rows.append({'check':label,'exit_code':r.returncode,'expected_exit_code':expected,'status':'PASS' if r.returncode==expected else 'FAIL'})
    return r
try:
    boot('boot-first')
    for n in range(1,4):
        r=command('submit-'+str(n),[str(base/'testenv/loop/submit.cjs'),'SYNTHETIC-ABSTRACT-FLOW-'+str(n)])
        assert r.returncode==0,r.stderr
    stop()
    before=json.loads((data/'store.json').read_text())
    assert len(before['events'])==3
    boot('boot-restart')
    r=command('readback-after-restart',[str(base/'testenv/loop/view.cjs')]); assert r.returncode==0
    view=json.loads(r.stdout)
    assert view['totals']['ack_received']==3 and view['totals']['REAL']==0
    after=json.loads((data/'store.json').read_text())
    assert before['events']==after['events']
    rows.append({'check':'three-results-survive-process-restart','status':'PASS','events':3})
    stop()
    for action in ['stopGrant','revokeGrant']:
        if action=='revokeGrant':
            data=pathlib.Path(tempfile.mkdtemp(prefix='revoke-only-',dir=out)); env['TESTENV_DATA_DIR']=str(data)
            boot('boot-fresh-revoke'); stop()
        expected_events=len(json.loads((data/'store.json').read_text())['events'])
        r=command(action,['-e',"const {createFileStore}=require(process.argv[1]); const s=createFileStore({dataDir:process.env.TESTENV_DATA_DIR}); console.log(JSON.stringify(s."+action+"({grant_id:'grant-local-e2e-001',reason:'synthetic-restart-probe'}))); ",str(base/'testenv/loop/file-store.cjs')])
        assert r.returncode==0,r.stderr
        blocked=json.loads((data/'store.json').read_text())['grants']['grant-local-e2e-001']
        assert blocked['stopped'] if action=='stopGrant' else blocked['revoked_at']
        boot('boot-after-'+action)
        resumed=json.loads((data/'store.json').read_text())['grants']['grant-local-e2e-001']
        preserved=bool(resumed['stopped']) if action=='stopGrant' else bool(resumed['revoked_at'])
        rows.append({'check':action+'-survives-restart','status':'PASS' if preserved else 'FAIL','before':blocked,'after':resumed})
        denied=command('submit-after-'+action,[str(base/'testenv/loop/submit.cjs'),'MUST-BE-DENIED'],expected=1)
        assert denied.returncode==1 and 'FORBIDDEN' in denied.stderr
        assert len(json.loads((data/'store.json').read_text())['events'])==expected_events
        stop()
    probe="""const assert=require('node:assert/strict'); const {createFileStore}=require(process.argv[1]); const s=createFileStore({dataDir:process.env.TESTENV_DATA_DIR}); const before=s.snapshot().grants['grant-local-e2e-001']; assert.throws(()=>s.createGrant({grant_id:before.grant_id,task_id:before.task_id}),e=>e.code==='EVENT_CONFLICT'); assert.deepEqual(s.snapshot().grants[before.grant_id],before); s.createGrant({grant_id:'explicit-new-synthetic-grant',task_id:'TASK-LOCAL-E2E',source_endpoint_id:'origin-local',destination_endpoint_id:'worker-mock'}); console.log('duplicate grant rejected; new independent synthetic grant created');"""
    r=command('duplicate-reject-new-grant-allowed',['-e',probe,str(base/'testenv/loop/file-store.cjs')]); assert r.returncode==0,r.stderr
    boot('boot-explicit-new-grant')
    r=command('submit-with-new-grant',[str(base/'testenv/loop/submit.cjs'),'EXPLICIT-NEW-GRANT-POSITIVE']); assert r.returncode==0,r.stderr
    stop()
    old_data=data
    data=pathlib.Path(tempfile.mkdtemp(prefix='expired-data-',dir=out)); env['TESTENV_DATA_DIR']=str(data)
    probe="""const {createFileStore}=require(process.argv[1]); const s=createFileStore({dataDir:process.env.TESTENV_DATA_DIR}); s.createGrant({grant_id:'grant-local-e2e-001',task_id:'TASK-LOCAL-E2E',source_endpoint_id:'origin-local',destination_endpoint_id:'worker-mock',expires_at:'2020-01-01T00:00:00.000Z'});"""
    r=command('seed-expired',['-e',probe,str(base/'testenv/loop/file-store.cjs')]); assert r.returncode==0
    expired_before=json.loads((data/'store.json').read_text())['grants']
    boot('boot-expired')
    r=command('submit-expired',[str(base/'testenv/loop/submit.cjs'),'EXPIRED-MUST-BE-DENIED'],expected=1); assert r.returncode==1 and 'FORBIDDEN' in r.stderr
    assert json.loads((data/'store.json').read_text())['grants']==expired_before
    rows.append({'check':'expired-grant-not-renewed','status':'PASS'})
    assert all(r.get('status')!='FAIL' for r in rows)
    completed=True
finally:
    stop()
    report={'overall':'PASS' if completed else 'FAIL','scope':'EXISTING_MOCK_LOCAL_PROCESS_ONLY','source_main':'d2ec331ea4fa68d5a2713f12f5d4706b8effb21a','source_queue':'a99f48a1cf3a848ef770b77701bf1e6283f11bad','source_blobs_verified_before_patch':11,'modified_source_paths':['testenv/loop/server.cjs','testenv/loop/file-store.cjs'],'external_ai_connected':False,'paid_api_calls':0,'persistent_service_left_running':False,'checks':rows}
    (out/'result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps(report,ensure_ascii=False,indent=2))
