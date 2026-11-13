'use strict';
// In-process transport only. The API remains responsible for authentication,
// authorization and durable state transitions; no synthetic success fallback.
const scopes = Object.freeze({receive:'tasks:receive',intent:'tasks:execute',
  authorize:'tasks:execute',execute:'tasks:execute',ack:'tasks:ack',
  fail:'tasks:execute',report:'tasks:report',status:'tasks:status'});
function createLocalWorkerClient({api, tokenProvider, protocol}={}) {
  if (!['legacy','intent-v1'].includes(protocol)) throw new TypeError('explicit worker protocol required');
  if (typeof tokenProvider !== 'function') throw new TypeError('tokenProvider required');
  const required = protocol === 'legacy' ? ['receive','execute','ack','fail'] : Object.keys(scopes);
  const missing = required.filter(k=>typeof api?.[k] !== 'function');
  if (missing.length) throw new TypeError('worker API missing: '+missing.join(','));
  const client = {};
  for (const action of Object.keys(scopes)) {
    if (typeof api?.[action] !== 'function') continue;
    client[action] = async (payload={}) => {
      const token = await tokenProvider({action,scopes:[scopes[action]]});
      if (typeof token !== 'string' || !token) throw new TypeError('worker token required');
      const request={headers:{authorization:'Bearer '+token}};
      if(action==='status') request.params={...payload};
      else request.body=action==='receive'?{}:{...payload};
      return api[action](request);
    };
  }
  return Object.freeze(client);
}
module.exports={createLocalWorkerClient};
