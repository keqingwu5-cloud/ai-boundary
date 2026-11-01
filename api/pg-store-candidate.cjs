'use strict';
// PostgreSQL-backed *candidate* adapter. Requires an injected pg-compatible
// pool with connect() and query(). This file opens no connection itself.
// Apply api/schema.sql + api/persistence-candidate.sql to an isolated DB first.
const {randomUUID} = require('node:crypto');
function error(code, message) { const e = new Error(message || code); e.code = code; return e; }
function dateString(x) { const t = new Date(x); if (!Number.isFinite(t.getTime())) throw error('BAD_REQUEST', 'invalid time'); return t.toISOString(); }
async function inTransaction(pool, fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const result = await fn(c);
    await c.query('COMMIT');
    return result;
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch { /* preserve original error */ }
    throw e;
  } finally { c.release(); }
}
const E = 'mainbrain_api.events';
const G = 'mainbrain_api.grants';
const A = 'mainbrain_api.attempts';
const R = 'mainbrain_api.receipts';
const L = 'mainbrain_api.event_logs';
const AL = 'mainbrain_api.alerts';
// User-facing anomaly messages are read-only. They do not grant execute/retry rights.
const ALERT_GUIDE=Object.freeze({
  LEASE_EXPIRED_OUTCOME_UNKNOWN:{reason:'任務租約到期，執行結果未知',impact:'blocked 只會停止重新派工，不保證外部模型已停止；可能重複執行與計費',next_action:'核對原執行端的 receipt/status 與外部完成時間；確認外部效果後再審核是否恢復，禁止盲目重派',dispatch_effect:'requeue_blocked_only',external_execution_state:'unknown',external_stop_confirmed:false},
  EXTERNAL_OUTCOME_UNKNOWN:{reason:'外部結果或 ACK 傳輸不確定',impact:'blocked 僅禁止重新派工；API 回應失敗不代表外部模型停止或執行失敗，未對帳就恢復可能重複執行',next_action:'核對同一 event_id、attempt_id 與遠端 execution_id／receipt；證據不足時繼續隔離，禁止盲目重試',dispatch_effect:'requeue_blocked_only',external_execution_state:'unknown',external_stop_confirmed:false},
  GRANT_INVALID:{reason:'授權已撤銷、逾期或不符合任務範圍',impact:'任務執行被安全阻止',next_action:'保留阻塞紀錄，只有合法授權者可重新授權'},
  ATTEMPT_LIMIT_REACHED:{reason:'任務已達重試上限',impact:'任務可能一直無法完成',next_action:'核對歷次錯誤及已執行的副作用，提出新的可否證修復方案'}
});
function createPostgresStore({pool, clock=()=>new Date().toISOString(), makeAttemptId=randomUUID, leaseSeconds=120}={}) {
  if (!pool || typeof pool.connect !== 'function' || typeof pool.query !== 'function')
    throw new TypeError('a pg-compatible pool is required');
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 10 || leaseSeconds > 3600)
    throw new TypeError('invalid leaseSeconds');
  const now = () => dateString(clock());
  async function audit(c, eventId, actor, action, detail={}) {
    await c.query('INSERT INTO '+L+' (event_id,actor_endpoint_id,action,detail) VALUES ($1,$2,$3,$4::jsonb)',
      [eventId,actor,action,JSON.stringify(detail)]);
  }
  // Durable anomaly inbox: one alert per event/reason. Repeated observations
  // update the same row instead of generating duplicate notifications.
  async function alert(c,eventId,code,severity,at,detail={}) {
    await c.query('INSERT INTO '+AL+
      ' (event_id,alert_code,severity,status,details,first_seen_at,last_seen_at,occurrences)'+
      " VALUES ($1,$2,$3,'open',$4::jsonb,$5::timestamptz,$5::timestamptz,1)"+
      ' ON CONFLICT(event_id,alert_code) DO UPDATE SET last_seen_at=EXCLUDED.last_seen_at,'+
      ' occurrences='+AL+'.occurrences+1,details=EXCLUDED.details,status=\'open\'',
      [eventId,code,severity,JSON.stringify(detail),at]);
  }
  // A timed-out lease is never automatically re-issued to another worker.
  // Its unknown external outcome is quarantined, auditable and visible via status.
  async function reapExpired(c,destination,at) {
    const rows=(await c.query(
      'WITH stale AS (SELECT event_id FROM '+E+
      " WHERE destination_endpoint_id=$1 AND state IN ('leased','executed')"+
      ' AND lease_until<=$2::timestamptz ORDER BY lease_until'+
      ' FOR UPDATE SKIP LOCKED LIMIT 100)'+
      ' UPDATE '+E+" AS e SET state='blocked',lease_until=NULL,updated_at=$2::timestamptz"+
      ' FROM stale WHERE e.event_id=stale.event_id RETURNING e.event_id,e.current_attempt_id',
      [destination,at])).rows;
    for(const item of rows){
      await audit(c,item.event_id,destination,'lease_expired_reconciliation_required',
        {attempt_id:item.current_attempt_id,outcome:'unknown'});
      await alert(c,item.event_id,'LEASE_EXPIRED_OUTCOME_UNKNOWN','P0',at,
        {attempt_id:item.current_attempt_id});
    }
    return rows.length;
  }
  async function checkGrant(c, event, action, at) {
    if (!event.grant_id) throw error('FORBIDDEN','event missing human grant');
    const row = (await c.query('SELECT * FROM '+G+' WHERE grant_id=$1 FOR SHARE',[event.grant_id])).rows[0];
    if (!row || row.stopped || row.revoked_at || !(row.allowed_actions||[]).includes(action) ||
        Date.parse(row.expires_at) <= Date.parse(at) ||
        row.task_id !== event.task_id ||
        row.source_endpoint_id !== event.source_endpoint_id ||
        row.destination_endpoint_id !== event.destination_endpoint_id)
      throw error('FORBIDDEN','grant revoked, expired, stopped or out of scope');
    return row;
  }
  async function locked(c,eventId) {
    const r=(await c.query('SELECT * FROM '+E+' WHERE event_id=$1 FOR UPDATE',[eventId])).rows[0];
    if(!r)throw error('NOT_FOUND','unknown event');
    return r;
  }
  function correctLease(r,p,at,allowed) {
    if (!allowed.includes(r.state) || r.current_attempt_id !== p.attempt_id ||
        r.destination_endpoint_id !== p.endpoint_id ||
        !r.lease_until || Date.parse(r.lease_until) <= Date.parse(at))
      throw error('EVENT_CONFLICT','invalid attempt, endpoint, state or expired lease');
  }
  return {
    // Storage enforces a real grant even if HTTP caller has a valid token.
    async enqueue(p) {
      const at=now();
      if(!p || !p.event_id || !p.task_id || !p.idempotency_key ||
         !p.source_endpoint_id || !p.destination_endpoint_id || !p.payload_digest || !p.payload_version)
        throw error('BAD_REQUEST','missing queue field');
      return inTransaction(pool,async c=>{
        const grants=await c.query(
          'SELECT * FROM '+G+" WHERE task_id=$1 AND source_endpoint_id=$2 AND destination_endpoint_id=$3 AND stopped=false AND revoked_at IS NULL AND expires_at>$4::timestamptz AND 'send'=ANY(allowed_actions) ORDER BY expires_at DESC LIMIT 1 FOR SHARE",
          [p.task_id,p.source_endpoint_id,p.destination_endpoint_id,at]);
        const grant=grants.rows[0];
        if(!grant)throw error('FORBIDDEN','no effective task-scoped human grant');
        const inserted=await c.query(
          'INSERT INTO '+E+' (event_id,task_id,source_endpoint_id,destination_endpoint_id,idempotency_key,payload_version,payload_digest,payload,state,grant_id,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,\'queued\',$9,$10::timestamptz) ON CONFLICT DO NOTHING RETURNING *',
          [p.event_id,p.task_id,p.source_endpoint_id,p.destination_endpoint_id,p.idempotency_key,p.payload_version,p.payload_digest,JSON.stringify(p.payload),grant.grant_id,at]);
        if(inserted.rows.length) {
          await audit(c,p.event_id,p.source_endpoint_id,'queued',{grant_id:grant.grant_id});
          return inserted.rows[0];
        }
        const prior=(await c.query(
          'SELECT * FROM '+E+' WHERE event_id=$1 OR (source_endpoint_id=$2 AND idempotency_key=$3) FOR UPDATE',
          [p.event_id,p.source_endpoint_id,p.idempotency_key])).rows;
        const old=prior.find(x=>x.source_endpoint_id===p.source_endpoint_id && x.idempotency_key===p.idempotency_key);
        if(old && old.event_id===p.event_id && old.task_id===p.task_id &&
           old.destination_endpoint_id===p.destination_endpoint_id &&
           old.payload_version===p.payload_version && old.payload_digest===p.payload_digest &&
           old.grant_id===grant.grant_id) return old;
        throw error(old?'IDEMPOTENCY_CONFLICT':'EVENT_CONFLICT','event identity already used');
      });
    },
    async lease({destination_endpoint_id}) {
      const at=now();
      return inTransaction(pool,async c=>{
        await reapExpired(c,destination_endpoint_id,at);
        const row=(await c.query(
          'SELECT * FROM '+E+" WHERE destination_endpoint_id=$1 AND state='queued' AND next_attempt_at<=$2::timestamptz ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
          [destination_endpoint_id,at])).rows[0];
        if(!row)return [];
        let grant;
        try{grant=await checkGrant(c,row,'receive',at);}
        catch(e){
          if(e.code!=='FORBIDDEN')throw e;
          await c.query('UPDATE '+E+" SET state='blocked',updated_at=$2::timestamptz WHERE event_id=$1",[row.event_id,at]);
          await audit(c,row.event_id,destination_endpoint_id,'blocked',{reason:'grant_invalid'});
          await alert(c,row.event_id,'GRANT_INVALID','P1',at,{reason:'revoked_expired_or_out_of_scope'});
          return [];
        }
        if(row.attempt_count >= grant.max_attempts){
          await c.query('UPDATE '+E+" SET state='failed',updated_at=$2::timestamptz WHERE event_id=$1",[row.event_id,at]);
          await audit(c,row.event_id,destination_endpoint_id,'failed',{reason:'attempt_limit'});
          await alert(c,row.event_id,'ATTEMPT_LIMIT_REACHED','P1',at,{attempt_count:row.attempt_count});
          return [];
        }
        const attemptId=makeAttemptId();
        if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(attemptId))
          throw error('EVENT_CONFLICT','attempt generator must return UUID');
        const result=(await c.query(
          'UPDATE '+E+" SET state='leased', current_attempt_id=$2::uuid,attempt_count=attempt_count+1,lease_until=$3::timestamptz + ($4::int * INTERVAL '1 second'),updated_at=$3::timestamptz WHERE event_id=$1 RETURNING *",
          [row.event_id,attemptId,at,leaseSeconds])).rows[0];
        await c.query('INSERT INTO '+A+' (event_id,attempt_id,attempt_no,leased_at,lease_until) VALUES ($1,$2::uuid,$3,$4::timestamptz,$5::timestamptz)',
          [row.event_id,attemptId,result.attempt_count,at,dateString(Date.parse(at)+leaseSeconds*1000)]);
        await audit(c,row.event_id,destination_endpoint_id,'leased',{attempt_id:attemptId,attempt_count:result.attempt_count});
        return [result];
      });
    },
    async markExecuted(p) {
      const at=now();
      return inTransaction(pool,async c=>{
        const e=await locked(c,p.event_id);
        await checkGrant(c,e,'execute',at);
        correctLease(e,p,at,['leased']);
        await c.query('INSERT INTO '+R+" (event_id,attempt_id,endpoint_id,channel,kind,evidence) VALUES ($1,$2::uuid,$3,'api','execution',$4::jsonb)",
          [e.event_id,p.attempt_id,p.endpoint_id,JSON.stringify({reference:p.execution_evidence})]);
        const updated=(await c.query('UPDATE '+E+" SET state='executed',updated_at=$2::timestamptz WHERE event_id=$1 RETURNING *",[e.event_id,at])).rows[0];
        await audit(c,e.event_id,p.endpoint_id,'executed',{attempt_id:p.attempt_id});
        return updated;
      });
    },
    async ack(p) {
      const at=now();
      return inTransaction(pool,async c=>{
        const e=await locked(c,p.event_id);
        if(p.channel!=='api')throw error('BAD_REQUEST','ChatGPT read receipt is a separate channel');
        await checkGrant(c,e,'ack',at);
        correctLease(e,p,at,['leased','executed']);
        if(e.payload_digest!==p.payload_digest || e.payload_version!==p.payload_version)
          throw error('EVENT_CONFLICT','wrong payload digest or version');
        await c.query('INSERT INTO '+R+" (event_id,attempt_id,endpoint_id,channel,kind,evidence) VALUES ($1,$2::uuid,$3,'api','ack',$4::jsonb)",
          [e.event_id,p.attempt_id,p.endpoint_id,JSON.stringify({reference:p.receipt_evidence})]);
        const updated=(await c.query('UPDATE '+E+" SET state='ack_received',updated_at=$2::timestamptz WHERE event_id=$1 RETURNING *",[e.event_id,at])).rows[0];
        await audit(c,e.event_id,p.endpoint_id,'ack_received',{attempt_id:p.attempt_id});
        return updated;
      });
    },
    async fail(p) {
      const at=now();
      return inTransaction(pool,async c=>{
        const e=await locked(c,p.event_id);
        const grant=await checkGrant(c,e,'execute',at);
        correctLease(e,p,at,['leased','executed']);
        // An uncertain external side effect cannot be put back in the queue.
        // Keep the attempt identity and require evidence-based reconciliation.
        if(p.reason==='reconciliation_required'){
          const frozen=(await c.query(
            'UPDATE '+E+" SET state='blocked',lease_until=NULL,updated_at=$2::timestamptz"+
            " WHERE event_id=$1 AND current_attempt_id=$3::uuid AND state IN ('leased','executed')"+
            ' RETURNING *',
            [e.event_id,at,p.attempt_id])).rows[0];
          if(!frozen)throw error('EVENT_CONFLICT','stale attempt cannot quarantine');
          await audit(c,e.event_id,p.endpoint_id,'reconciliation_required',
            {attempt_id:p.attempt_id,reason:'external_execution_result_uncertain'});
          await alert(c,e.event_id,'EXTERNAL_OUTCOME_UNKNOWN','P0',at,
            {attempt_id:p.attempt_id,reason:'execute_or_ack_uncertain'});
          return frozen;
        }
        const terminal=e.attempt_count>=grant.max_attempts;
        const delay=Math.min(3600,30*2**Math.min(8,e.attempt_count-1));
        const updated=(await c.query(
          'UPDATE '+E+" SET state=$2,next_attempt_at=$3::timestamptz + ($4::int * INTERVAL '1 second'),lease_until=NULL,updated_at=$3::timestamptz WHERE event_id=$1 RETURNING *",
          [e.event_id,terminal?'failed':'queued',at,terminal?0:delay])).rows[0];
        await audit(c,e.event_id,p.endpoint_id,terminal?'failed':'requeued',
          {attempt_id:p.attempt_id,reason:String(p.reason||'worker failure').slice(0,200),backoff_seconds:terminal?0:delay});
        return updated;
      });
    },
    async get(eventId) {
      const event=(await pool.query('SELECT * FROM '+E+' WHERE event_id=$1',[eventId])).rows[0];
      if(!event)return null;
      const alerts=(await pool.query('SELECT alert_code,severity,status,details,first_seen_at,last_seen_at,occurrences FROM '+AL+" WHERE event_id=$1 AND status='open' ORDER BY severity,first_seen_at",[eventId])).rows;
      return {...event,alerts:alerts.map(a=>({...a,...(ALERT_GUIDE[a.alert_code]||{reason:'未分類事件，需人工查核',impact:'影響未確認',next_action:'檢查原始事件與錯誤日誌'}),delivery:'inbox_only_not_pushed'}))};
    }
  };
}
module.exports={createPostgresStore};
