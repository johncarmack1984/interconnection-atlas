import { describe, expect, it } from "vitest"
import { loadRealDataset, REAL_META } from "./real"
import { isPlaceable, type StateDatum } from "./dataset"
import projectsJson from "./real/projects.json"
import stateMetricsJson from "./real/state-metrics.json"
import isoOutlinesJson from "./real/iso-outlines.json"

// Exercises the vendored real dataset (committed JSON snapshot) through the loader
// the app uses — the actual payload (~2,000 plotted points), not just one metric.
const ds = loadRealDataset()

const FUELS = new Set(["solar", "wind", "storage", "gas", "load"])
const STATUSES = new Set(["active", "under-study", "operational", "withdrawn"])

describe("loadRealDataset — metrics", () => {
  it("exposes an honestly-labeled canceled/postponed metric in GW", () => {
    const m = ds.metrics.find((x) => x.key === "canceledGw")
    expect(m).toBeDefined()
    expect(m!.label).toMatch(/canceled/i)
    expect(m!.unit).toBe("GW")
  })

  it("aggregates canceledGw to the exact per-state sum (not merely > 0)", () => {
    const m = ds.metrics.find((x) => x.key === "canceledGw")!
    const expected = ds.states.reduce((s, x) => s + (x.values.canceledGw ?? 0), 0)
    expect(m.aggregate!(ds.states)).toBeCloseTo(expected, 6)
    expect(expected).toBeGreaterThan(0)
  })

  it("guards the pressure aggregator against divide-by-zero", () => {
    const pressure = ds.metrics.find((m) => m.key === "pressure")!
    const states: StateDatum[] = [
      { id: "99", name: "Nowhere", iso: "Non-ISO", values: { proposedGw: 5, existingGw: 0 } },
    ]
    expect(pressure.aggregate!(states)).toBe(0)
  })
})

describe("loadRealDataset — payload", () => {
  it("loads every plotted project with a valid fuel, status, capacity, and US coords", () => {
    expect(ds.projects.length).toBe(REAL_META.projects.plotted)
    // US incl. AK/HI bounding box; a project outside it means a bad re-vendor.
    const bad = ds.projects.filter(
      (p) =>
        !FUELS.has(p.fuel) ||
        !STATUSES.has(p.status) ||
        !Number.isFinite(p.lon) ||
        !Number.isFinite(p.lat) ||
        p.lon <= -180 ||
        p.lon >= -66 ||
        p.lat <= 17 ||
        p.lat >= 72 ||
        p.capacityMw < 1
    )
    expect(bad).toEqual([])
  })

  it("gives every project a placeable FIPS stateId", () => {
    expect(ds.projects.filter((p) => !isPlaceable(p.stateId))).toEqual([])
  })

  it("carries a finite, non-negative canceledGw on every state", () => {
    expect(ds.states.length).toBeGreaterThanOrEqual(51)
    const bad = ds.states.filter(
      (s) => !Number.isFinite(s.values.canceledGw) || s.values.canceledGw < 0
    )
    expect(bad).toEqual([])
  })
})

describe("vendored real-data snapshot consistency", () => {
  // Catches a stale / mismatched re-vendor: the meta counts the app shows users
  // (App.tsx renders REAL_META.projects.plotted) must match the committed arrays.
  const projects = projectsJson as unknown as unknown[]
  const stateMetrics = stateMetricsJson as unknown as Array<{ canceledGw: number }>
  const isoOutlines = isoOutlinesJson as unknown as { features: unknown[] }

  it("meta cross-references match the committed JSON arrays", () => {
    expect(REAL_META.projects.plotted).toBe(projects.length)
    expect(REAL_META.isoOutlines.features).toBe(isoOutlines.features.length)
    expect(REAL_META.states.withProposed).toBe(stateMetrics.length)
  })

  it("per-state canceled GW reconciles with the national total", () => {
    const sum = stateMetrics.reduce((s, r) => s + r.canceledGw, 0)
    expect(Math.abs(sum - REAL_META.canceled.totalGw)).toBeLessThan(0.1)
  })
})
