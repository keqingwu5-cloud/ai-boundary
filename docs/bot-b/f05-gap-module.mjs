// F05 G-0: pure, fail-closed source-event / local-inbox reconciliation candidate.
// This module does NOT subscribe to GitHub, verify webhook signatures, or ACK Grok.
// A caller must provide trusted source snapshots and persisted receiver records.
const fields = ['delivery_id', 'source', 'comment_id', 'revision', 'body'];

function validSourceEvent(ev) {
  return ev !== null && typeof ev === 'object' &&
    typeof ev.delivery_id === 'string' && ev.delivery_id.trim() !== '' &&
    typeof ev.source === 'string' && ev.source.trim() !== '' &&
    (Number.isSafeInteger(ev.comment_id) && ev.comment_id > 0 ||
      typeof ev.comment_id === 'string' && ev.comment_id.trim() !== '') &&
    typeof ev.revision === 'string' && ev.revision.trim() !== '' &&
    typeof ev.body === 'string';
}

export function detectGap(sourceEvents, localRecords) {
  if (!Array.isArray(sourceEvents) || !Array.isArray(localRecords)) {
    throw new TypeError('sourceEvents and localRecords must be arrays');
  }
  const gaps = [];
  for (const ev of sourceEvents) {
    const delivery_id = ev?.delivery_id ?? null;
    const comment_id = ev?.comment_id ?? null;
    if (!validSourceEvent(ev)) {
      gaps.push({ delivery_id, comment_id, status: 'INVALID_SOURCE_EVENT' });
      continue;
    }
    // Delivery identity and business identity are distinct; never accept a
    // matching delivery ID alone as evidence that the correct event was saved.
    const byDelivery = localRecords.filter(r => r && r.delivery_id === ev.delivery_id);
    if (byDelivery.length === 0) {
      gaps.push({ delivery_id, comment_id, status: 'MISSING' });
      continue;
    }
    // A conflicting duplicate must not be hidden behind one matching record.
    const exact = byDelivery.every(r =>
      r.source === ev.source &&
      r.comment_id === ev.comment_id &&
      r.revision === ev.revision &&
      r.body === ev.body
    );
    if (!exact) gaps.push({ delivery_id, comment_id, status: 'MISMATCH' });
  }
  return gaps;
}
