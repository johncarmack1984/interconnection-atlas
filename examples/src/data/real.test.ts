import { describe, expect, it } from "vitest"
import { loadRealDataset } from "./real"

// Exercises the vendored real dataset (committed JSON snapshot) through the loader
// the app uses — in particular the canceled/postponed metric added in Phase 4.
describe("loadRealDataset", () => {
  const ds = loadRealDataset()

  it("exposes an honestly-labeled canceled/postponed metric in GW", () => {
    const m = ds.metrics.find((x) => x.key === "canceledGw")
    expect(m).toBeDefined()
    expect(m!.label).toMatch(/canceled/i)
    expect(m!.unit).toBe("GW")
  })

  it("carries a finite, non-negative canceledGw on every state", () => {
    expect(ds.states.length).toBeGreaterThanOrEqual(51)
    for (const s of ds.states) {
      expect(Number.isFinite(s.values.canceledGw)).toBe(true)
      expect(s.values.canceledGw).toBeGreaterThanOrEqual(0)
    }
  })

  it("rolls canceledGw up to a positive national total", () => {
    const m = ds.metrics.find((x) => x.key === "canceledGw")!
    expect(m.aggregate!(ds.states)).toBeGreaterThan(0)
  })
})
