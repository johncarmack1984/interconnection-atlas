/**
 * Pure, side-effect-free transforms used by build-real-data.ts. Extracted so the
 * parsing / geometry / lookup logic is unit-testable without running the vendoring
 * script (which fetches the network and writes files). Importing this module does
 * nothing on its own — every export is a pure function or a constant lookup table.
 */

// Two-letter postal -> 2-digit state FIPS (the `id` on the us-atlas features the
// map joins against). Only the 50 states + DC; territories are dropped (the map's
// geoAlbersUsa can't place them anyway).
export const POSTAL_FIPS: Record<string, string> = {
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09",
  DE: "10", DC: "11", FL: "12", GA: "13", HI: "15", ID: "16", IL: "17",
  IN: "18", IA: "19", KS: "20", KY: "21", LA: "22", ME: "23", MD: "24",
  MA: "25", MI: "26", MN: "27", MS: "28", MO: "29", MT: "30", NE: "31",
  NV: "32", NH: "33", NJ: "34", NM: "35", NY: "36", NC: "37", ND: "38",
  OH: "39", OK: "40", OR: "41", PA: "42", RI: "44", SC: "45", SD: "46",
  TN: "47", TX: "48", UT: "49", VT: "50", VA: "51", WA: "53", WV: "54",
  WI: "55", WY: "56",
}
// FIPS -> full state name, so per-state rows can resolve their dominant ISO.
export const FIPS_NAME: Record<string, string> = {
  "01": "Alabama", "02": "Alaska", "04": "Arizona", "05": "Arkansas",
  "06": "California", "08": "Colorado", "09": "Connecticut", "10": "Delaware",
  "11": "District of Columbia", "12": "Florida", "13": "Georgia", "15": "Hawaii",
  "16": "Idaho", "17": "Illinois", "18": "Indiana", "19": "Iowa", "20": "Kansas",
  "21": "Kentucky", "22": "Louisiana", "23": "Maine", "24": "Maryland",
  "25": "Massachusetts", "26": "Michigan", "27": "Minnesota", "28": "Mississippi",
  "29": "Missouri", "30": "Montana", "31": "Nebraska", "32": "Nevada",
  "33": "New Hampshire", "34": "New Jersey", "35": "New Mexico", "36": "New York",
  "37": "North Carolina", "38": "North Dakota", "39": "Ohio", "40": "Oklahoma",
  "41": "Oregon", "42": "Pennsylvania", "44": "Rhode Island", "45": "South Carolina",
  "46": "South Dakota", "47": "Tennessee", "48": "Texas", "49": "Utah",
  "50": "Vermont", "51": "Virginia", "53": "Washington", "54": "West Virginia",
  "55": "Wisconsin", "56": "Wyoming",
}

export type Fuel = "solar" | "wind" | "storage" | "gas"
// EIA Technology string -> one of the four generation fuels the library colors.
// Anything else (hydro, nuclear, geothermal, biomass, coal…) is dropped from the
// plotted points and counted as "other" — planned capacity is ~solar/storage/
// wind/gas dominated, so the loss is small and we log it.
export function techToFuel(tech: string): Fuel | null {
  const t = tech.toLowerCase()
  if (t.includes("solar")) return "solar"
  if (t.includes("wind")) return "wind"
  if (t.includes("batter")) return "storage"
  if (t.includes("pumped storage")) return "storage"
  if (t.includes("gas")) return "gas"
  return null
}

// EIA development-status code -> the library's queue-status vocabulary. The cells
// are full descriptions like "(P) Planned for installation…", so pull the code in
// the leading parens.
//   P/L   approvals not started / pending       -> under-study
//   T/U/V approved / under construction          -> active
//   TS    built, not yet in commercial service   -> operational
export type Status = "active" | "under-study" | "operational"
// The recognized EIA development-status codes. Anything else still buckets as
// "active", but build-real-data counts + logs the unknowns so a new EIA code
// surfaces on the next re-vendor rather than being silently mislabeled.
export const KNOWN_STATUS_CODES = new Set(["P", "L", "T", "U", "V", "TS"])
// Pull the leading-parens code from a cell like "(P) Planned for installation…".
export function parseStatusCode(raw: string): string {
  const m = raw.match(/^\(([A-Z]+)\)/)
  return m ? m[1] : raw.trim().toUpperCase()
}
export function statusFor(raw: string): Status {
  const c = parseStatusCode(raw)
  if (c === "P" || c === "L") return "under-study"
  if (c === "TS") return "operational"
  return "active"
}

export const num = (v: unknown): number => {
  if (typeof v === "number") return v
  if (v == null) return NaN
  return parseFloat(String(v).replace(/,/g, ""))
}
// Read an optional, possibly-absent column (resolver returns null if unmatched).
export const cell = (row: Record<string, unknown>, key: string | null): unknown =>
  key ? row[key] : null
export const r3 = (n: number) => Math.round(n * 1000) / 1000
export const r4 = (n: number) => Math.round(n * 10000) / 10000

// Sum a sheet's rows into per-state { count, mw }, keyed by 2-digit FIPS. Rows
// whose Plant State isn't one of the 50 + DC, or whose nameplate MW isn't a
// positive finite number, are skipped — mirroring how the proposed/operating
// totals filter. Pure, so the canceled/postponed aggregation stays unit-testable.
export function sumByState(
  rows: Record<string, unknown>[],
  stateCol: string,
  mwCol: string
): Record<string, { count: number; mw: number }> {
  const acc: Record<string, { count: number; mw: number }> = {}
  for (const row of rows) {
    const fips = POSTAL_FIPS[String(row[stateCol] ?? "").trim()]
    if (!fips) continue
    const mw = num(row[mwCol])
    if (!Number.isFinite(mw) || mw <= 0) continue
    const a = acc[fips] ?? (acc[fips] = { count: 0, mw: 0 })
    a.count++
    a.mw += mw
  }
  return acc
}

// Douglas–Peucker tolerance for the ISO outlines, in degrees (~2 km). They are
// drawn as standalone strokes (no shared borders), so each ring simplifies
// independently and aggressively — visually lossless on a national-scale map.
export const SIMPLIFY_EPS = 0.02

// Ramer–Douglas–Peucker on a [lon,lat] ring (planar approximation — fine for an
// outline at this scale). Keeps endpoints, so ring closure is preserved.
export function rdp(pts: number[][], eps: number): number[][] {
  if (pts.length < 3) return pts
  const [ax, ay] = pts[0]
  const [bx, by] = pts[pts.length - 1]
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy)
  let dmax = 0
  let idx = 0
  for (let i = 1; i < pts.length - 1; i++) {
    // Closed ring (first == last) → zero-length baseline; fall back to distance
    // from the start vertex so the ring splits at its farthest point.
    const d = len === 0
      ? Math.hypot(pts[i][0] - ax, pts[i][1] - ay)
      : Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len
    if (d > dmax) { dmax = d; idx = i }
  }
  if (dmax > eps) {
    return rdp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(pts.slice(idx), eps))
  }
  return [pts[0], pts[pts.length - 1]]
}
export const ring = (r: number[][]): number[][] =>
  rdp(r, SIMPLIFY_EPS).map((p) => [r3(p[0]), r3(p[1])])
// Bounding-box diagonal of a ring, in degrees — used to drop tiny offshore slivers.
export const ringSpan = (r: number[][]): number => {
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity
  for (const [x, y] of r) {
    if (x < xmin) xmin = x
    if (x > xmax) xmax = x
    if (y < ymin) ymin = y
    if (y > ymax) ymax = y
  }
  return Math.hypot(xmax - xmin, ymax - ymin)
}
// Simplify a (Multi)Polygon: thin every ring, drop degenerate/sliver rings.
export function simplifyGeometry(geom: { type: string; coordinates: unknown }): unknown {
  if (geom.type === "Polygon") {
    const rings = (geom.coordinates as number[][][]).map(ring).filter((r) => r.length >= 4)
    return { type: "Polygon", coordinates: rings }
  }
  if (geom.type === "MultiPolygon") {
    const polys = (geom.coordinates as number[][][][])
      .map((poly) => poly.map(ring).filter((r) => r.length >= 4))
      .filter((poly) => poly.length > 0 && ringSpan(poly[0]) > 0.05)
    return { type: "MultiPolygon", coordinates: polys }
  }
  return geom
}

// Resolve the actual column key from a list of header candidates (EIA tweaks
// header wording across vintages, so match case-insensitively by substring).
export function resolver(sample: Record<string, unknown>) {
  const keys = Object.keys(sample)
  return (...cands: string[]): string | null => {
    for (const c of cands) {
      const lc = c.toLowerCase()
      const hit = keys.find((k) => k.toLowerCase().trim() === lc)
      if (hit) return hit
    }
    for (const c of cands) {
      const lc = c.toLowerCase()
      const hit = keys.find((k) => k.toLowerCase().includes(lc))
      if (hit) return hit
    }
    return null
  }
}

// Count coordinate pairs in a GeoJSON geometry (used to pick the real footprint
// over any sliver/stub when a NAME pattern matches more than one feature).
export function countPts(g: { coordinates: unknown }): number {
  const walk = (x: unknown): number =>
    Array.isArray(x) ? (typeof x[0] === "number" ? 1 : x.reduce((s: number, y) => s + walk(y), 0)) : 0
  return walk(g.coordinates)
}
