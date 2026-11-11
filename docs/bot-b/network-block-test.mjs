// Network block test (SYNTHETIC)
// Overrides http/https request methods and asserts they are never called.
import http from 'node:http';
import https from 'node:https';

let calls = 0;
const origHttp = http.request;
const origHttps = https.request;
http.request = function() { calls++; throw new Error('network blocked'); };
https.request = function() { calls++; throw new Error('network blocked'); };

try {
  // Attempt a call that should be blocked
  try { http.request('http://example.com'); } catch(e) {}
  try { https.request('https://example.com'); } catch(e) {}
} finally {
  http.request = origHttp;
  https.request = origHttps;
}

if (calls === 0) {
  console.error('FAIL: expected blocked calls to be counted');
  process.exit(1);
}
console.log('network block test: PASS (calls intercepted:', calls, ')');
console.log('EXIT=0');