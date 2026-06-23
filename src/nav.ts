// Spatial arrow-key navigation between states. Pure geometry, kept out of the
// component so it can be tested with controlled centroids (geoAlbersUsa.fitSize
// collapses small fixtures, so direction can't be exercised through projection).

export type Centroid = [number, number]

/**
 * Id of the centroid nearest to `fromId` in the pressed direction `(dx, dy)`,
 * or null when nothing lies ahead. Candidates behind the direction are rejected;
 * among those ahead, the score favors a small forward distance and a small
 * lateral offset off the axis (perpendicular offset weighted 2×, so a roughly
 * aligned neighbor beats a closer but off-axis one).
 */
export function nearestInDirection(
  centroids: Map<string, Centroid>,
  fromId: string,
  dx: number,
  dy: number
): string | null {
  const from = centroids.get(fromId)
  if (!from) return null
  let best: string | null = null
  let bestScore = Infinity
  centroids.forEach(([ox, oy], oid) => {
    if (oid === fromId) return
    const vx = ox - from[0]
    const vy = oy - from[1]
    const along = vx * dx + vy * dy // distance in the pressed direction
    if (along <= 0) return // wrong way
    const perp = Math.abs(vx * dy - vy * dx) // lateral offset off the axis
    const score = along + perp * 2 // favor aligned + close
    if (score < bestScore) {
      bestScore = score
      best = oid
    }
  })
  return best
}
