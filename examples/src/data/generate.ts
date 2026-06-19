import * as d3 from "d3"
import * as topojson from "topojson-client"
import statesTopo from "us-atlas/states-10m.json"
import type {
  Fuel,
  IsoOutlineCollection,
  QueueProject,
  QueueStatus,
  RegionCollection,
} from "interconnection-atlas"
import { FUEL_META } from "interconnection-atlas"
import { ISO_META, OUTLINED_ISOS, isoForState } from "./iso-regions"

export interface StateDatum {
  id: string
  name: string
  iso: string
  /** Available interconnection / hosting headroom, MW. */
  hostingCapacityMw: number
  /** Median time a request waits in this state's queue, months. */
  queueWaitMonths: number
  /** Total nameplate capacity sitting in the active queue, GW. */
  queueGw: number
}

export interface AtlasData {
  regions: RegionCollection
  isoOutlines: IsoOutlineCollection
  states: StateDatum[]
  statesById: Map<string, StateDatum>
  projects: QueueProject[]
}

// Deterministic PRNG so the atlas is identical on every load (stable demo +
// screenshots). Math.random is intentionally avoided.
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FUEL_WEIGHTS: Array<[Fuel, number]> = [
  ["solar", 0.34],
  ["storage", 0.26],
  ["load", 0.16],
  ["wind", 0.14],
  ["gas", 0.1],
]

const STATUS_WEIGHTS: Array<[QueueStatus, number]> = [
  ["withdrawn", 0.42], // most queued projects never get built — a real pattern
  ["active", 0.3],
  ["under-study", 0.18],
  ["operational", 0.1],
]

// Capacity range (MW) by type; data-center load and gas skew large.
const CAPACITY_MW: Record<Fuel, [number, number]> = {
  solar: [60, 760],
  wind: [90, 880],
  storage: [20, 520],
  gas: [120, 1080],
  load: [120, 980],
}

const QUEUE_YEARS: Array<[number, number]> = [
  [2019, 1],
  [2020, 1],
  [2021, 2],
  [2022, 3],
  [2023, 4],
  [2024, 5],
  [2025, 4],
]

const pick = <T,>(rng: () => number, weighted: Array<[T, number]>): T => {
  const total = weighted.reduce((s, [, w]) => s + w, 0)
  let r = rng() * total
  for (const [v, w] of weighted) {
    if ((r -= w) <= 0) return v
  }
  return weighted[weighted.length - 1][0]
}

const between = (rng: () => number, lo: number, hi: number) => lo + rng() * (hi - lo)

const ISO_QUEUE_BUMP: Record<string, number> = {
  ERCOT: 1.5,
  MISO: 1.4,
  PJM: 1.45,
  CAISO: 1.2,
  SPP: 1.2,
}

export function buildAtlasData(seed = 42): AtlasData {
  const rng = mulberry32(seed)
  // topojson's published types are awkward to satisfy from a raw JSON import;
  // the shapes are correct at runtime, so cast at this single seam.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const topo = statesTopo as any
  const statesObj = topo.objects.states

  const regions = topojson.feature(topo, statesObj) as unknown as RegionCollection

  // Merge each ISO's member states into one boundary outline.
  const geometries: Array<{ id: string; properties: { name: string } }> =
    statesObj.geometries
  const isoOutlines: IsoOutlineCollection = {
    type: "FeatureCollection",
    features: OUTLINED_ISOS.map((iso) => {
      const members = geometries.filter((g) => isoForState(g.properties.name) === iso)
      const merged = topojson.merge(topo, members as any)
      return {
        type: "Feature" as const,
        geometry: merged,
        properties: {
          iso,
          name: ISO_META[iso].name,
          color: ISO_META[iso].color,
        },
      }
    }),
  }

  // Only place projects in states geoAlbersUsa can actually draw (excludes PR
  // and other territories, FIPS >= 60).
  const placeable = regions.features.filter((f) => Number(f.id) < 60)

  // Per-state metrics.
  const states: StateDatum[] = placeable.map((f) => {
    const name = f.properties.name
    const iso = isoForState(name)
    const queueGw = Math.round(
      (3 + Math.pow(rng(), 2.2) * 200) * (ISO_QUEUE_BUMP[iso] ?? 1)
    )
    const tightness = 1 - (Math.min(queueGw, 250) / 250) * 0.45
    const hostingCapacityMw = Math.round((500 + rng() * 12000) * tightness / 50) * 50
    const queueWaitMonths = Math.round(
      Math.max(16, Math.min(84, ISO_META[iso].waitBaseMonths + (rng() - 0.5) * 16))
    )
    return { id: String(f.id), name, iso, hostingCapacityMw, queueWaitMonths, queueGw }
  })
  const statesById = new Map(states.map((s) => [s.id, s]))

  // Weighted state pool (more queue volume → more queued projects).
  const featureById = new Map(placeable.map((f) => [String(f.id), f]))
  const statePool: Array<[StateDatum, number]> = states.map((s) => [s, s.queueGw])

  const N = 240
  const projects: QueueProject[] = []
  for (let i = 0; i < N; i++) {
    const state = pick(rng, statePool)
    const feature = featureById.get(state.id)
    if (!feature) continue
    const [[w, s], [e, n]] = d3.geoBounds(feature)
    let lon = 0
    let lat = 0
    let placed = false
    for (let tries = 0; tries < 40; tries++) {
      lon = between(rng, w, e)
      lat = between(rng, s, n)
      if (d3.geoContains(feature, [lon, lat])) {
        placed = true
        break
      }
    }
    if (!placed) {
      ;[lon, lat] = d3.geoCentroid(feature)
    }
    const fuel = pick(rng, FUEL_WEIGHTS)
    const [lo, hi] = CAPACITY_MW[fuel]
    projects.push({
      id: `q${i}`,
      name: `#${1000 + i} · ${state.name}`,
      lon,
      lat,
      capacityMw: Math.round(between(rng, lo, hi)),
      fuel,
      status: pick(rng, STATUS_WEIGHTS),
      stateId: state.id,
      iso: state.iso,
      queueYear: pick(rng, QUEUE_YEARS),
    })
  }

  return { regions, isoOutlines, states, statesById, projects }
}

export { FUEL_META }
