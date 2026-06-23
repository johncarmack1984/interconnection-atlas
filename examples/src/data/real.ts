// Real-data dataset: vendored from EIA-860M (proposed generators) + HIFLD
// (ISO/RTO footprints) by scripts/build-real-data.ts. Everything here is a fixed,
// committed snapshot — no network, deterministic, offline-capable.
//
// Honest scope: EIA-860M "planned" generators are a SUBSET of the full
// interconnection queue (no withdrawn / early-study requests, no queue-entry
// date, and no large loads / data centers — that queue has no public
// project-level source). True transmission "hosting capacity" per state isn't
// public either (FERC base cases are CEII-restricted), so the choropleth is
// reframed as proposed capacity / queue pressure rather than headroom.
import { isoForState } from "./iso-regions"
import {
  RAMPS,
  isPlaceable,
  loadRegions,
  round0,
  sumOf,
  type AtlasDataset,
  type Metric,
  type StateDatum,
} from "./dataset"
import type { IsoOutlineCollection, QueueProject } from "interconnection-atlas"
import isoOutlinesJson from "./real/iso-outlines.json"
import projectsJson from "./real/projects.json"
import stateMetricsJson from "./real/state-metrics.json"
import metaJson from "./real/meta.json"

interface RealStateRow {
  id: string
  proposedGw: number
  proposedCount: number
  existingGw: number
  pressurePct: number
  canceledGw: number
  canceledCount: number
}

export const REAL_META = metaJson as unknown as {
  isoOutlines: { source: string; features: number }
  projects: { source: string; plotted: number; plannedRows: number; dropped: Record<string, number> }
  canceled: { source: string; rows: number; totalGw: number; statesWithData: number }
  states: { withProposed: number }
}

const REAL_METRICS: Metric[] = [
  {
    key: "proposedGw",
    short: "Proposed capacity",
    hint: "Proposed generation in development — EIA-860M planned (GW)",
    label: "Proposed capacity (GW)",
    interpolator: RAMPS.green,
    format: round0,
    unit: "GW",
    aggregate: sumOf("proposedGw"),
  },
  {
    key: "proposedCount",
    short: "Proposed projects",
    hint: "Number of proposed generators — EIA-860M planned",
    label: "Proposed projects (count)",
    interpolator: RAMPS.purple,
    format: round0,
    aggregate: sumOf("proposedCount"),
  },
  {
    key: "pressure",
    short: "Queue pressure",
    hint: "Proposed ÷ existing capacity (%) — how much new generation wants in vs. what's built",
    label: "Queue pressure — proposed ÷ existing (%)",
    interpolator: RAMPS.orange,
    format: round0,
    unit: "%",
    // National pressure is total proposed ÷ total existing, not a mean of ratios.
    aggregate: (states) => {
      const p = states.reduce((s, x) => s + (x.values.proposedGw ?? 0), 0)
      const e = states.reduce((s, x) => s + (x.values.existingGw ?? 0), 0)
      return e > 0 ? Math.round((p / e) * 100) : 0
    },
  },
  {
    key: "canceledGw",
    short: "Canceled/postponed",
    hint: "Canceled or postponed generation — EIA-860M Canceled-or-Postponed sheet (GW); an attrition proxy, not interconnection-queue withdrawals",
    label: "Canceled / postponed (GW)",
    interpolator: RAMPS.red,
    format: round0,
    unit: "GW",
    aggregate: sumOf("canceledGw"),
  },
]

export function loadRealDataset(): AtlasDataset {
  const regions = loadRegions()
  const isoOutlines = isoOutlinesJson as unknown as IsoOutlineCollection
  const projects = projectsJson as unknown as QueueProject[]
  const rows = stateMetricsJson as unknown as RealStateRow[]
  const byId = new Map(rows.map((r) => [r.id, r]))

  const states: StateDatum[] = regions.features
    .filter((f) => isPlaceable(f.id))
    .map((f) => {
      const id = String(f.id)
      const name = f.properties.name
      const r = byId.get(id)
      return {
        id,
        name,
        iso: isoForState(name),
        values: {
          proposedGw: r?.proposedGw ?? 0,
          proposedCount: r?.proposedCount ?? 0,
          pressure: r?.pressurePct ?? 0,
          existingGw: r?.existingGw ?? 0,
          canceledGw: r?.canceledGw ?? 0,
        },
      }
    })
  const statesById = new Map(states.map((s) => [s.id, s]))

  return { source: "real", regions, isoOutlines, states, statesById, projects, metrics: REAL_METRICS }
}
