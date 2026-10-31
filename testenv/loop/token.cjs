'use strict';
const crypto = require('node:crypto');
function mintToken({ secret, endpoint_id, scopes, audience = 'mainbrain-api', clock = Date.now, ttlSec = 120 }) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('secret too short');
  const now = Math.floor(clock() / 1000);
  const claims = { endpoint_id, aud: audience, iat: now, exp: now + ttlSec, scopes };
  const encoded = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return encoded + '.' + signature;
}
module.exports = { mintToken };
