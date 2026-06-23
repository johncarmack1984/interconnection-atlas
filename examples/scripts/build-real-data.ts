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
 *
 * The pure parsing / geometry / lookup helpers live in ./transforms (unit-tested
 * in transforms.test.ts); this file owns only the network + filesystem side effects.
 */
import * as XLSX from "xlsx"
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { ISO_META, isoForState } from "../src/data/iso-regions"
import {
  FIPS_NAME,
  POSTAL_FIPS,
  cell,
  countPts,
  num,
  r3,
  r4,
  KNOWN_STATUS_CODES,
  parseStatusCode,
  resolver,
  simplifyGeometry,
  statusFor,
  sumByState,
  techToFuel,
} from "./transforms"

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, "../src/data/real")
const cacheFile = resolve(here, ".cache/eia860m-april2026.xlsx")
const hifldCache = resolve(here, ".cache/hifld-control-areas.json")

const EIA_MONTH = "April 2026"
const EIA_URL =
  "https://www.eia.gov/electricity/data/eia860m/xls/april_generator2026.xlsx"
// HIFLD "Control Areas" layer (balancing-authority footprints). The dedicated
// "Independent System Operators" layer ships a corrupt SPP geometry (8 points),
// so we take all seven ISOs from here, where each BA footprint is complete and
// equals the ISO footprint.
const CONTROL_AREAS =
  "https://services5.arcgis.com/HDRa0B57OVrv2E1q/arcgis/rest/services/Control_Areas/FeatureServer/0/query"

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
  const canceled = readSheet(wb, /cancel|postpon/i)
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
  const unknownStatus: Record<string, number> = {}
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
    const rawStatus = String(row[C.status] ?? "")
    const sc = parseStatusCode(rawStatus)
    if (sc && !KNOWN_STATUS_CODES.has(sc)) unknownStatus[sc] = (unknownStatus[sc] ?? 0) + 1
    projects.push({
      id,
      name: String(cell(row, C.plant) ?? "Proposed generator"),
      lon: r4(lon),
      lat: r4(lat),
      capacityMw: Math.max(1, Math.round(mw)),
      fuel,
      status: statusFor(rawStatus),
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

  // Canceled / postponed generators (EIA-860M "Canceled or Postponed" sheet) —
  // an automatable attrition proxy, aggregated per state only. NOT plotted as
  // points: EIA-canceled is a developer/utility cancellation, not the same event
  // as an interconnection-queue withdrawal, so conflating them would mislead.
  const ck = resolver(canceled[0])
  const canceledByState = sumByState(
    canceled,
    ck("Plant State")!,
    ck("Nameplate Capacity (MW)", "Nameplate Capacity")!
  )
  const canceledTotalMw = Object.values(canceledByState).reduce((s, x) => s + x.mw, 0)

  // Per-state metric rows (only the 50 states + DC that have proposed capacity).
  const stateMetrics = Object.keys(proposedMw)
    .sort()
    .map((fips) => {
      const ex = existingMw[fips] ?? 0
      const can = canceledByState[fips]
      return {
        id: fips,
        proposedGw: r3(proposedMw[fips] / 1000),
        proposedCount: proposedCount[fips],
        existingGw: r3(ex / 1000),
        pressurePct: ex > 0 ? Math.round((proposedMw[fips] / ex) * 100) : 0,
        canceledGw: r3((can?.mw ?? 0) / 1000),
        canceledCount: can?.count ?? 0,
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
    canceled: {
      source: `EIA-860M ${EIA_MONTH} — Canceled or Postponed generators (public domain)`,
      rows: canceled.length,
      totalGw: r3(canceledTotalMw / 1000),
      statesWithData: Object.keys(canceledByState).length,
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
  if (Object.keys(unknownStatus).length)
    console.log(`  ⚠ unknown status codes (bucketed active): ${JSON.stringify(unknownStatus)}`)
  console.log(`States       : ${stateMetrics.length} with proposed cap  (${size("state-metrics.json")})`)
  console.log(`Canceled     : ${Object.keys(canceledByState).length} states, ${r3(canceledTotalMw / 1000)} GW over ${canceled.length} rows`)
  console.log(`Top proposed : ${top.map((s) => `${FIPS_NAME[s.id]} ${s.proposedGw}GW`).join(", ")}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
