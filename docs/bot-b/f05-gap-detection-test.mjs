// F05 gap detection test (SYNTHETIC)
// Simulates: GitHub has an event, but local receiver has no record.
// Asserts the gap is detected and not treated as received.

const githubEvents = [
  { delivery_id: 'del-001', comment_id: 1001, body: 'test event' }
];
const localRecords = []; // empty: receiver missed it

function detectGap(github, local) {
  const gaps = [];
  for (const ev of github) {
    const found = local.find(r => r.delivery_id === ev.delivery_id);
    if (!found) {
      gaps.push({ delivery_id: ev.delivery_id, status: 'MISSING' });
    }
  }
  return gaps;
}

const gaps = detectGap(githubEvents, localRecords);
if (gaps.length === 0) {
  console.error('FAIL: gap not detected');
  process.exit(1);
}
console.log('gap detection: PASS');
console.log('gaps:', JSON.stringify(gaps));
console.log('EXIT=0');