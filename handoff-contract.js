/* Cross-system handoff identity and receipt contract. Browser + Node, no network calls. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HandoffContract = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SCHEMA = 'ai-boundary.handoff.v0.3';
  const STATES = ['candidate', 'queued', 'delivered', 'ack_received', 'reviewed', 'closed', 'blocked', 'failed', 'needs_approval'];
  const RESOURCE_TYPES = ['issue', 'pull_request', 'notion_page'];
  function required(v, field) { if (typeof v !== 'string' || !v.trim()) throw Error(field + ' is required'); return v.trim(); }
  function parseResourceUrl(raw) {
    const input = required(raw, 'canonical_url');
    let u;
    try { u = new URL(input); } catch { throw Error('invalid canonical_url'); }
    if (u.protocol !== 'https:' || u.username || u.password) throw Error('canonical_url must use HTTPS without credentials');
    const host = u.hostname.toLowerCase();
    if (host === 'github.com') {
      const m = /^\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)\/?$/.exec(u.pathname);
      if (!m) throw Error('unsupported GitHub resource URL');
      if (u.search || u.hash) throw Error('GitHub canonical_url must not contain query or fragment');
      return { provider: 'github', scope: m[1] + '/' + m[2], resource_type: m[3] === 'issues' ? 'issue' : 'pull_request', resource_id: m[4], canonical_url: 'https://github.com/' + m[1] + '/' + m[2] + '/' + m[3] + '/' + m[4] };
    }
    if (host === 'app.notion.com' || host === 'www.notion.so' || host === 'notion.so') {
      const m = /([0-9a-f]{32})$/i.exec(u.pathname.replace(/-/g, ''));
      if (!m) throw Error('unsupported Notion page URL');
      return { provider: 'notion', scope: 'notion', resource_type: 'notion_page', resource_id: m[1].toLowerCase(), canonical_url: 'https://app.notion.com/p/' + m[1].toLowerCase() };
    }
    throw Error('unsupported provider');
  }
  function validateResource(resource) {
    if (!resource || typeof resource !== 'object') throw Error('resource object is required');
    const parsed = parseResourceUrl(resource.canonical_url);
    if (!RESOURCE_TYPES.includes(resource.resource_type)) throw Error('unknown resource_type');
    for (const k of ['provider', 'scope', 'resource_type', 'resource_id']) {
      if (String(resource[k] || '').toLowerCase() !== parsed[k].toLowerCase()) throw Error(k + ' does not match canonical_url');
    }
    return parsed;
  }
  function validateEvent(event) {
    if (!event || event.schema !== SCHEMA) throw Error('unsupported event schema');
    for (const key of ['task_id','event_id','correlation_id','attempt_id','idempotency_key','source_agent_id','source_endpoint_id','destination_agent_id','destination_endpoint_id','payload_version','payload_digest','user_original_goal']) required(event[key], key);
    if (!/^[a-f0-9]{64}$/.test(event.payload_digest)) throw Error('payload_digest must be lowercase SHA-256');
    validateResource(event.resource);
    if (!STATES.includes(event.state)) throw Error('unknown state');
    if (event.state === 'ack_received' && !event.verified_ack) throw Error('ack_received requires verified_ack');
    return event;
  }
  function checkDuplicate(existing, incoming) {
    validateEvent(incoming);
    const prior = existing.find(x => x.idempotency_key === incoming.idempotency_key);
    if (!prior) return { result: 'new' };
    return { result: prior.event_id === incoming.event_id && prior.payload_version === incoming.payload_version && prior.payload_digest === incoming.payload_digest ? 'duplicate' : 'conflict', prior_event_id: prior.event_id };
  }
  function retry(event, newEventId, newAttemptId, newKey) {
    validateEvent(event);
    const next = { ...event, event_id: required(newEventId, 'newEventId'), attempt_id: required(newAttemptId, 'newAttemptId'), idempotency_key: required(newKey, 'newKey'), state: 'candidate', verified_ack: null, retry_of: event.event_id };
    if (next.event_id === event.event_id || next.attempt_id === event.attempt_id || next.idempotency_key === event.idempotency_key) throw Error('retry must have new event, attempt and idempotency IDs');
    return validateEvent(next);
  }
  function acceptAck(event, ack, trustedContext) {
    validateEvent(event);
    if (!ack || !trustedContext || trustedContext.verified !== true) throw Error('ACK requires trusted independent verification');
    for (const k of ['event_id','task_id','payload_version']) if (ack[k] !== event[k]) throw Error('ACK ' + k + ' mismatch');
    if (trustedContext.endpoint_id !== event.destination_endpoint_id || trustedContext.agent_id !== event.destination_agent_id) throw Error('ACK sender identity mismatch');
    if (ack.endpoint_id !== trustedContext.endpoint_id) throw Error('ACK endpoint claim mismatch');
    required(ack.read_evidence, 'ACK read_evidence');
    required(ack.received_at, 'ACK received_at');
    if (!Number.isFinite(Date.parse(ack.received_at))) throw Error('invalid ACK timestamp');
    if (!['delivered','queued'].includes(event.state)) throw Error('ACK not permitted in state ' + event.state);
    return { ...event, state: 'ack_received', verified_ack: { event_id: event.event_id, endpoint_id: trustedContext.endpoint_id, actor: trustedContext.agent_id, received_at: ack.received_at, read_evidence: ack.read_evidence } };
  }
  function markDelivered(event, deliveryEvidence) {
    validateEvent(event);
    if (event.state !== 'queued') throw Error('delivered requires queued state');
    if (!deliveryEvidence || deliveryEvidence.verified !== true || !deliveryEvidence.destination_endpoint_id || deliveryEvidence.destination_endpoint_id !== event.destination_endpoint_id) throw Error('delivery requires independently verified endpoint evidence');
    required(deliveryEvidence.evidence, 'delivery evidence');
    return { ...event, state: 'delivered', delivery_evidence: { destination_endpoint_id: deliveryEvidence.destination_endpoint_id, evidence: deliveryEvidence.evidence } };
  }
  return { SCHEMA, STATES, RESOURCE_TYPES, parseResourceUrl, validateResource, validateEvent, checkDuplicate, retry, acceptAck, markDelivered };
});
