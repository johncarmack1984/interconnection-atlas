import * as d3 from "d3"
import * as topojson from "topojson-client"
import statesTopo from "us-atlas/states-10m.json"
import type {
  Fuel,
  IsoOutlineCollection,
  QueueProject,
  QueueStatus,
} from "interconnection-atlas"
import {
  RAMPS,
  compact,
  isPlaceable,
  loadRegions,
  medianOf,
  round0,
  sumOf,
  type AtlasDataset,
  type Metric,
  type StateDatum,
} from "./dataset"
import { ISO_META, OUTLINED_ISOS, isoForState } from "./iso-regions"

// Deterministic PRNG so the atlas is identical on every load (stable demo +
// screenshots). Math.random is intentionally avoided. Exported for unit tests.
export function mulberry32(seed: number) {
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

// Capacity range (MW) by type; data-center load and gas skew large. Exported so
// tests can assert generated points fall within their fuel's range.
export const CAPACITY_MW: Record<Fuel, [number, number]> = {
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

// Each metric owns its color ramp + formatting; the national roll-up matches how
// the metric reads (capacity / queue sum, wait takes the median).
const SYNTHETIC_METRICS: Metric[] = [
  {
    key: "capacity",
    short: "Hosting capacity",
    hint: "Available interconnection headroom (MW)",
    label: "Available hosting capacity (MW)",
    interpolator: RAMPS.green,
    format: compact,
    unit: "MW",
    aggregate: sumOf("capacity"),
  },
  {
    key: "wait",
    short: "Queue wait",
    hint: "Median time a request waits in study (months)",
    label: "Median queue wait (months)",
    interpolator: RAMPS.orange,
    format: round0,
    unit: "mo",
    aggregate: medianOf("wait"),
  },
  {
    key: "queue",
    short: "Queue volume",
    hint: "Active nameplate capacity in queue (GW)",
    label: "Active queue volume (GW)",
    interpolator: RAMPS.purple,
    format: round0,
    unit: "GW",
    aggregate: sumOf("queue"),
  },
]

/** Seeded, illustrative dataset — geometry is real (us-atlas), but every capacity
 *  / queue number is synthetic, shaped to echo real ISO patterns. ISO outlines
 *  use the simplified one-per-state merge (contrast the real footprints). */
export function buildSyntheticDataset(seed = 42): AtlasDataset {
  const rng = mulberry32(seed)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topo = statesTopo as any
  const statesObj = topo.objects.states
  const regions = loadRegions()

  const geometries: Array<{ id: string; properties: { name: string } }> = statesObj.geometries
  const isoOutlines: IsoOutlineCollection = {
    type: "FeatureCollection",
    features: OUTLINED_ISOS.map((iso) => {
      const members = geometries.filter((g) => isoForState(g.properties.name) === iso)
      const merged = topojson.merge(topo, members as never)
      return {
        type: "Feature" as const,
        geometry: merged,
        properties: { iso, name: ISO_META[iso].name, color: ISO_META[iso].color },
      }
    }),
  }

  const placeable = regions.features.filter((f) => isPlaceable(f.id))

  const states: StateDatum[] = placeable.map((f) => {
    const name = f.properties.name
    const iso = isoForState(name)
    const queue = Math.round((3 + Math.pow(rng(), 2.2) * 200) * (ISO_QUEUE_BUMP[iso] ?? 1))
    const tightness = 1 - (Math.min(queue, 250) / 250) * 0.45
    const capacity = Math.round(((500 + rng() * 12000) * tightness) / 50) * 50
    const wait = Math.round(
      Math.max(16, Math.min(84, ISO_META[iso].waitBaseMonths + (rng() - 0.5) * 16))
    )
    return { id: String(f.id), name, iso, values: { capacity, wait, queue } }
  })
  const statesById = new Map(states.map((s) => [s.id, s]))

  // Weighted state pool (more queue volume → more queued projects).
  const featureById = new Map(placeable.map((f) => [String(f.id), f]))
  const statePool: Array<[StateDatum, number]> = states.map((s) => [s, s.values.queue])

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

  return { source: "synthetic", regions, isoOutlines, states, statesById, projects, metrics: SYNTHETIC_METRICS }
}
