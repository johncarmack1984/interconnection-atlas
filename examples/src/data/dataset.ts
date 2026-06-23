// The shape the map + panel consume, produced identically by the synthetic and
// real builders. Swapping data sources is just swapping which AtlasDataset is
// active — the library component never changes.
import * as d3 from "d3"
import * as topojson from "topojson-client"
import statesTopo from "us-atlas/states-10m.json"
import type {
  IsoOutlineCollection,
  QueueProject,
  RegionCollection,
} from "interconnection-atlas"

export type SourceKey = "real" | "synthetic"

/** One US state row: id / name / ISO plus a bag of metric values keyed by Metric.key. */
export interface StateDatum {
  id: string
  name: string
  iso: string
  values: Record<string, number>
}

/** A choropleth metric — owns its color ramp, labels, number formatting, and how
 *  it rolls up to a national figure. */
export interface Metric {
  key: string
  /** Toggle button label. */
  short: string
  /** Toggle tooltip. */
  hint: string
  /** Legend title + choropleth tooltip row. */
  label: string
  interpolator: (t: number) => string
  format: (n: number) => string
  /** Suffix shown in the detail panel (e.g. "GW", "%"). */
  unit?: string
  /** National roll-up across states; defaults to a plain sum where omitted. */
  aggregate?: (states: StateDatum[]) => number
}

export interface AtlasDataset {
  source: SourceKey
  regions: RegionCollection
  isoOutlines: IsoOutlineCollection
  states: StateDatum[]
  statesById: Map<string, StateDatum>
  projects: QueueProject[]
  metrics: Metric[]
}

// Dark-theme sequential ramps: low values sit near the map background, high glow.
// One hue per concept so a glance reads the metric, not just a state.
export const RAMPS = {
  green: d3.interpolateRgbBasis(["#152330", "#1f6f4f", "#57d98e"]),
  orange: d3.interpolateRgbBasis(["#152330", "#7a3b2e", "#e8835f"]),
  purple: d3.interpolateRgbBasis(["#152330", "#3a3a6b", "#9b8cf0"]),
  red: d3.interpolateRgbBasis(["#152330", "#7a2e34", "#e8606b"]),
}

export const compact = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n))
export const round0 = (n: number) => String(Math.round(n))

/** us-atlas TopoJSON → state GeoJSON. Geometry is real in both modes; only the
 *  values/outlines/points differ. The raw-JSON import types are awkward to
 *  satisfy, so cast at this one seam. */
export function loadRegions(): RegionCollection {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topo = statesTopo as any
  return topojson.feature(topo, topo.objects.states) as unknown as RegionCollection
}

/** Only states geoAlbersUsa can draw (excludes PR + territories, FIPS >= 60). */
export const isPlaceable = (id: string | number | undefined) => Number(id) < 60

export const sumOf = (key: string) => (states: StateDatum[]) =>
  states.reduce((s, x) => s + (x.values[key] ?? 0), 0)

export const medianOf = (key: string) => (states: StateDatum[]) => {
  const xs = states.map((s) => s.values[key] ?? 0).sort((a, b) => a - b)
  if (!xs.length) return 0
  const m = Math.floor(xs.length / 2)
  return xs.length % 2 ? xs[m] : Math.round((xs[m - 1] + xs[m]) / 2)
}
