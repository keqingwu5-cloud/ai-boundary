// F05 gap detection test
// Calls the formal module; includes counter-examples.
import { detectGap } from './f05-gap-module.mjs';

// Case 1: missing event -> must detect gap
const github1 = [{ delivery_id: 'del-001', comment_id: 1001, body: 'test' }];
const local1 = [];
const gaps1 = detectGap(github1, local1);
if (gaps1.length !== 1) {
  console.error('FAIL: missing event not detected');
  process.exit(1);
}

// Case 2: already received -> must NOT report gap
const github2 = [{ delivery_id: 'del-002', comment_id: 1002, body: 'ok' }];
const local2 = [{ delivery_id: 'del-002', comment_id: 1002, body: 'ok' }];
const gaps2 = detectGap(github2, local2);
if (gaps2.length !== 0) {
  console.error('FAIL: received event reported as gap');
  process.exit(1);
}

// Case 3: same ID but different body -> must report gap
const github3 = [{ delivery_id: 'del-003', comment_id: 1003, body: 'new' }];
const local3 = [{ delivery_id: 'del-003', comment_id: 1003, body: 'old' }];
const gaps3 = detectGap(github3, local3);
if (gaps3.length !== 1) {
  console.error('FAIL: content mismatch not detected');
  process.exit(1);
}

console.log('f05 gap detection: PASS');
console.log('EXIT=0');