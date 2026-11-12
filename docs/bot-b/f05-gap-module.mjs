// Formal F05 gap detection module
// Compares GitHub events against local records.

export function detectGap(githubEvents, localRecords) {
  const gaps = [];
  for (const ev of githubEvents) {
    const found = localRecords.find(r =>
      r.delivery_id === ev.delivery_id &&
      r.comment_id === ev.comment_id &&
      r.body === ev.body
    );
    if (!found) {
      gaps.push({
        delivery_id: ev.delivery_id,
        comment_id: ev.comment_id,
        status: 'MISSING'
      });
    }
  }
  return gaps;
}