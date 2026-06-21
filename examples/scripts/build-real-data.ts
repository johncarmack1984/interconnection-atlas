/**
 * Dev-time vendoring script — turns two public, free-to-use upstream datasets
 * into the small JSON the example imports, so the deployed demo stays fully
 * static, offline-capable, and deterministic (a fixed snapshot, not a live fetch).
 *
 *   bun run build:data            (from examples/)
 *
 * Sources (both public domain):
 *   - ISO/RTO outlines : HIFLD "Independent System Operators" (re-hosted ArcGIS
 *     FeatureServer) — 7 real footprints, GeoJSON in one query.
 *   - Proposed projects + per-state capacity : EIA-860M monthly workbook
 *     (Planned + Operating sheets). Real lat/lon, nameplate MW, technology.
 *
 * Outputs (committed) under src/data/real/:
 *   iso-outlines.json · projects.json · state-metrics.json · meta.json
 *
 * Honest scope: EIA-860M "planned" generators are a SUBSET of the full
 * interconnection queue (no withdrawn/early-study requests, no queue-entry date,
 * and no large loads / data centers — that queue has no public project-level
 * source). We label this in the UI; we do not pretend it is the whole queue.
 */
import * as XLSX from "xlsx"
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { ISO_META, isoForState } from "../src/data/iso-regions"

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, "../src/data/real")
const cacheFile = resolve(here, ".cache/eia860m-april2026.xlsx")
const hifldCache = resolve(here, ".cache/hifld-control-areas.json")

// Douglas–Peucker tolerance for the ISO outlines, in degrees (~2 km). They are
// drawn as standalone strokes (no shared borders), so each ring simplifies
// independently and aggressively — visually lossless on a national-scale map.
const SIMPLIFY_EPS = 0.02

const EIA_MONTH = "April 2026"
const EIA_URL =
  "https://www.eia.gov/electricity/data/eia860m/xls/april_generator2026.xlsx"
// HIFLD "Control Areas" layer (balancing-authority footprints). The dedicated
// "Independent System Operators" layer ships a corrupt SPP geometry (8 points),
// so we take all seven ISOs from here, where each BA footprint is complete and
// equals the ISO footprint.
const CONTROL_AREAS =
  "https://services5.arcgis.com/HDRa0B57OVrv2E1q/arcgis/rest/services/Control_Areas/FeatureServer/0/query"

// Two-letter postal -> 2-digit state FIPS (the `id` on the us-atlas features the
// map joins against). Only the 50 states + DC; territories are dropped (the map's
// geoAlbersUsa can't place them anyway).
const POSTAL_FIPS: Record<string, string> = {
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
const FIPS_NAME: Record<string, string> = {
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

// ISO code -> a distinctive NAME substring in the Control_Areas layer. Each
// pattern matches exactly one balancing authority (verified against the layer).
const ISO_PATTERNS: Array<[string, string]> = [
  ["CAISO", "CALIFORNIA INDEPENDENT"],
  ["ERCOT", "ELECTRIC RELIABILITY COUNCIL OF TEXAS"],
  ["ISO-NE", "ISO NEW ENGLAND"],
  ["MISO", "MIDCONTINENT INDEPENDENT"],
  ["NYISO", "NEW YORK INDEPENDENT"],
  ["PJM", "PJM INTERCONNECTION"],
  ["SPP", "SOUTHWEST POWER POOL"],
]
// EIA balancing-authority code -> ISO code (for per-project ISO tagging).
const BA_TO_ISO: Record<string, string> = {
  CISO: "CAISO", ERCO: "ERCOT", ISNE: "ISO-NE", MISO: "MISO",
  NYIS: "NYISO", PJM: "PJM", SWPP: "SPP",
}

type Fuel = "solar" | "wind" | "storage" | "gas"
// EIA Technology string -> one of the four generation fuels the library colors.
// Anything else (hydro, nuclear, geothermal, biomass, coal…) is dropped from the
// plotted points and counted as "other" — planned capacity is ~solar/storage/
// wind/gas dominated, so the loss is small and we log it.
function techToFuel(tech: string): Fuel | null {
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
type Status = "active" | "under-study" | "operational"
function statusFor(raw: string): Status {
  const m = raw.match(/^\(([A-Z]+)\)/)
  const c = m ? m[1] : raw.trim().toUpperCase()
  if (c === "P" || c === "L") return "under-study"
  if (c === "TS") return "operational"
  return "active"
}

const num = (v: unknown): number => {
  if (typeof v === "number") return v
  if (v == null) return NaN
  return parseFloat(String(v).replace(/,/g, ""))
}
// Read an optional, possibly-absent column (resolver returns null if unmatched).
const cell = (row: Record<string, unknown>, key: string | null): unknown =>
  key ? row[key] : null
const r3 = (n: number) => Math.round(n * 1000) / 1000
const r4 = (n: number) => Math.round(n * 10000) / 10000

// Ramer–Douglas–Peucker on a [lon,lat] ring (planar approximation — fine for an
// outline at this scale). Keeps endpoints, so ring closure is preserved.
function rdp(pts: number[][], eps: number): number[][] {
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
const ring = (r: number[][]): number[][] =>
  rdp(r, SIMPLIFY_EPS).map((p) => [r3(p[0]), r3(p[1])])
// Bounding-box diagonal of a ring, in degrees — used to drop tiny offshore slivers.
const ringSpan = (r: number[][]): number => {
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
function simplifyGeometry(geom: { type: string; coordinates: unknown }): unknown {
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
function resolver(sample: Record<string, unknown>) {
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

// Read a named EIA sheet into objects, auto-detecting the header row (the files
// carry a title row or two above the real header).
function readSheet(wb: XLSX.WorkBook, match: RegExp): Record<string, unknown>[] {
  const name = wb.SheetNames.find((n) => match.test(n))
  if (!name) throw new Error(`No sheet matching ${match} in [${wb.SheetNames.join(", ")}]`)
  const ws = wb.Sheets[name]
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false })
  const hdr = aoa.findIndex((row) =>
    row.some((c) => String(c).trim() === "Plant State") &&
    row.some((c) => String(c).includes("Nameplate Capacity"))
  )
  if (hdr < 0) throw new Error(`Could not find a header row in sheet "${name}"`)
  return XLSX.utils.sheet_to_json(ws, { range: hdr, defval: null })
}

// Count coordinate pairs in a GeoJSON geometry (used to pick the real footprint
// over any sliver/stub when a NAME pattern matches more than one feature).
function countPts(g: { coordinates: unknown }): number {
  const walk = (x: unknown): number =>
    Array.isArray(x) ? (typeof x[0] === "number" ? 1 : x.reduce((s: number, y) => s + walk(y), 0)) : 0
  return walk(g.coordinates)
}

// Fetch one balancing-authority footprint by NAME substring; if several match,
// keep the one with the most vertices.
async function fetchControlArea(pattern: string): Promise<{
  properties: { NAME: string }
  geometry: { type: string; coordinates: unknown }
}> {
  const where = encodeURIComponent(`NAME LIKE '%${pattern}%'`)
  const url = `${CONTROL_AREAS}?where=${where}&outFields=NAME&outSR=4326&f=geojson`
  const j = (await (await fetch(url)).json()) as {
    features: Array<{ properties: { NAME: string }; geometry: { type: string; coordinates: unknown } }>
  }
  const feats = j.features ?? []
  if (!feats.length) throw new Error(`No Control_Areas feature matched "${pattern}"`)
  feats.sort((a, b) => countPts(b.geometry) - countPts(a.geometry))
  return feats[0]
}

async function main() {
  mkdirSync(outDir, { recursive: true })

  // ----- 1. ISO/RTO outlines (HIFLD Control Areas) -------------------------
  type RawArea = { iso: string; name: string; geometry: { type: string; coordinates: unknown } }
  let rawIso: RawArea[]
  if (existsSync(hifldCache)) {
    console.log("· Reading cached ISO/RTO outlines (HIFLD Control Areas)…")
    rawIso = JSON.parse(readFileSync(hifldCache, "utf8"))
  } else {
    console.log("· Fetching ISO/RTO outlines (HIFLD Control Areas)…")
    rawIso = []
    for (const [iso, pattern] of ISO_PATTERNS) {
      const f = await fetchControlArea(pattern)
      rawIso.push({ iso, name: f.properties.NAME, geometry: f.geometry })
      console.log(`  ${iso}: ${countPts(f.geometry)} pts (${f.properties.NAME})`)
    }
    mkdirSync(dirname(hifldCache), { recursive: true })
    writeFileSync(hifldCache, JSON.stringify(rawIso))
  }
  const isoFeatures = rawIso.map(({ iso, geometry }) => {
    const meta = ISO_META[iso]
    return {
      type: "Feature" as const,
      geometry: simplifyGeometry(geometry),
      properties: { iso, name: meta.name, color: meta.color },
    }
  })
  const isoOutlines = { type: "FeatureCollection" as const, features: isoFeatures }
  writeFileSync(resolve(outDir, "iso-outlines.json"), JSON.stringify(isoOutlines))

  // ----- 2. EIA-860M workbook ----------------------------------------------
  let buf: Buffer
  if (existsSync(cacheFile)) {
    console.log(`· Reading cached EIA-860M (${EIA_MONTH})…`)
    buf = readFileSync(cacheFile)
  } else {
    console.log(`· Downloading EIA-860M (${EIA_MONTH})…`)
    buf = Buffer.from(await (await fetch(EIA_URL)).arrayBuffer())
    mkdirSync(dirname(cacheFile), { recursive: true })
    writeFileSync(cacheFile, buf)
  }
  const wb = XLSX.read(buf, { type: "buffer" })
  console.log(`  sheets: ${wb.SheetNames.join(", ")}`)

  const planned = readSheet(wb, /planned/i)
  const operating = readSheet(wb, /operating/i)
  const k = resolver(planned[0])
  const C = {
    state: k("Plant State")!,
    plant: k("Plant Name"),
    plantId: k("Plant ID", "Plant Code"),
    genId: k("Generator ID"),
    mw: k("Nameplate Capacity (MW)", "Nameplate Capacity")!,
    tech: k("Technology")!,
    status: k("Status")!,
    ba: k("Balancing Authority Code", "Balancing Authority"),
    lat: k("Latitude")!,
    lon: k("Longitude")!,
    year: k("Planned Operation Year", "Operating Year"),
  }
  console.log("  planned columns resolved:", C)

  // Per-state accumulators.
  const proposedMw: Record<string, number> = {}
  const proposedCount: Record<string, number> = {}
  const existingMw: Record<string, number> = {}

  // Proposed projects -> points + state totals.
  const projects: Array<Record<string, unknown>> = []
  const drop = { state: 0, mw: 0, latlon: 0, fuel: 0 }
  const seen = new Set<string>()
  for (const row of planned) {
    const fips = POSTAL_FIPS[String(row[C.state] ?? "").trim()]
    if (!fips) { drop.state++; continue }
    const mw = num(row[C.mw])
    if (!Number.isFinite(mw) || mw <= 0) { drop.mw++; continue }

    // Every valid planned generator counts toward the state's proposed total…
    proposedMw[fips] = (proposedMw[fips] ?? 0) + mw
    proposedCount[fips] = (proposedCount[fips] ?? 0) + 1

    // …but only the four mappable generation fuels with coordinates get plotted.
    const fuel = techToFuel(String(row[C.tech] ?? ""))
    if (!fuel) { drop.fuel++; continue }
    const lon = num(row[C.lon])
    const lat = num(row[C.lat])
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) { drop.latlon++; continue }

    let id = `eia-${cell(row, C.plantId) ?? "?"}-${cell(row, C.genId) ?? projects.length}`
    while (seen.has(id)) id += "x"
    seen.add(id)
    const ba = String(cell(row, C.ba) ?? "").trim()
    const year = num(cell(row, C.year))
    projects.push({
      id,
      name: String(cell(row, C.plant) ?? "Proposed generator"),
      lon: r4(lon),
      lat: r4(lat),
      capacityMw: Math.max(1, Math.round(mw)),
      fuel,
      status: statusFor(String(row[C.status] ?? "")),
      stateId: fips,
      iso: BA_TO_ISO[ba] ?? isoForState(FIPS_NAME[fips] ?? ""),
      queueYear: Number.isFinite(year) ? year : 2026,
    })
  }

  // Existing capacity per state (denominator for the "queue pressure" metric).
  const ek = resolver(operating[0])
  const eState = ek("Plant State")!
  const eMw = ek("Nameplate Capacity (MW)", "Nameplate Capacity")!
  for (const row of operating) {
    const fips = POSTAL_FIPS[String(row[eState] ?? "").trim()]
    if (!fips) continue
    const mw = num(row[eMw])
    if (Number.isFinite(mw) && mw > 0) existingMw[fips] = (existingMw[fips] ?? 0) + mw
  }

  // Per-state metric rows (only the 50 states + DC that have proposed capacity).
  const stateMetrics = Object.keys(proposedMw)
    .sort()
    .map((fips) => {
      const ex = existingMw[fips] ?? 0
      return {
        id: fips,
        proposedGw: r3(proposedMw[fips] / 1000),
        proposedCount: proposedCount[fips],
        existingGw: r3(ex / 1000),
        pressurePct: ex > 0 ? Math.round((proposedMw[fips] / ex) * 100) : 0,
      }
    })
  writeFileSync(resolve(outDir, "state-metrics.json"), JSON.stringify(stateMetrics))
  writeFileSync(resolve(outDir, "projects.json"), JSON.stringify(projects))

  const meta = {
    generatedNote: "Vendored by scripts/build-real-data.ts — do not edit by hand.",
    isoOutlines: { source: "HIFLD Control Areas — balancing-authority footprints (public domain)", features: isoFeatures.length },
    projects: {
      source: `EIA-860M ${EIA_MONTH} — Planned generators (public domain)`,
      plotted: projects.length,
      plannedRows: planned.length,
      dropped: drop,
    },
    states: { withProposed: stateMetrics.length },
  }
  writeFileSync(resolve(outDir, "meta.json"), JSON.stringify(meta, null, 2))

  // ----- summary -----------------------------------------------------------
  const size = (f: string) => `${(statSync(resolve(outDir, f)).size / 1024).toFixed(0)} KB`
  const top = [...stateMetrics].sort((a, b) => b.proposedGw - a.proposedGw).slice(0, 5)
  console.log("\n=== build:data summary ===")
  console.log(`ISO outlines : ${isoFeatures.length} features        (${size("iso-outlines.json")})`)
  console.log(`Projects     : ${projects.length} plotted of ${planned.length} planned  (${size("projects.json")})`)
  console.log(`  dropped    : ${JSON.stringify(drop)}`)
  console.log(`States       : ${stateMetrics.length} with proposed cap  (${size("state-metrics.json")})`)
  console.log(`Top proposed : ${top.map((s) => `${FIPS_NAME[s.id]} ${s.proposedGw}GW`).join(", ")}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
