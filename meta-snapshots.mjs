// SyncWith appends chronological extracts that can overlap with earlier extracts.
// Keep the latest contiguous block for each day. Within it, prefer placement detail.
export function canonicalMetaRows(rows, placements, dateKey) {
  const runs = new Map();
  let current;
  for (let index = 0; index < rows.length; index++) {
    const day = dateKey(rows[index][0]);
    if (!day) {
      current = undefined;
      continue;
    }
    if (current?.day !== day) {
      current = { day, indices: [] };
      runs.set(day, current);
    }
    current.indices.push(index);
  }
  const keep = new Set();
  for (const run of runs.values()) {
    const hasPlacements = run.indices.some(index => placements[index]);
    for (const index of run.indices) {
      if (!hasPlacements || placements[index]) keep.add(index);
    }
  }
  return keep;
}
