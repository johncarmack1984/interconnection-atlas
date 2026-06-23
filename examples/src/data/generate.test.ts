import { describe, it, expect } from "vitest"
import { FUEL_META, STATUS_META } from "interconnection-atlas"
import { CAPACITY_MW, buildSyntheticDataset, mulberry32 } from "./generate"
import { isPlaceable } from "./dataset"
import { OUTLINED_ISOS } from "./iso-regions"

describe("mulberry32", () => {
  it("is reproducible for a given seed", () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a(), a(), a()]).toEqual([b(), b(), b(), b(), b()])
  })
  it("produces different streams for different seeds", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)())
  })
  it("emits floats in [0, 1)", () => {
    const r = mulberry32(7)
    for (let i = 0; i < 50; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe("buildSyntheticDataset", () => {
  const data = buildSyntheticDataset(42)
  const fuels = new Set(Object.keys(FUEL_META))
  const statuses = new Set(Object.keys(STATUS_META))

  it("is deterministic across calls with the same seed", () => {
    expect(buildSyntheticDataset(42)).toEqual(buildSyntheticDataset(42))
  })

  it("marks the dataset as synthetic", () => {
    expect(data.source).toBe("synthetic")
  })

  it("generates exactly 240 queue projects", () => {
    expect(data.projects).toHaveLength(240)
  })

  it("outlines every OUTLINED ISO", () => {
    expect(data.isoOutlines.features).toHaveLength(OUTLINED_ISOS.length)
  })

  it("only includes placeable states", () => {
    expect(data.states.length).toBeGreaterThan(0)
    for (const s of data.states) expect(isPlaceable(s.id)).toBe(true)
  })

  it("places every project in-range, in the US, with valid vocab", () => {
    for (const p of data.projects) {
      expect(fuels.has(p.fuel)).toBe(true)
      expect(statuses.has(p.status)).toBe(true)
      const [lo, hi] = CAPACITY_MW[p.fuel]
      expect(p.capacityMw).toBeGreaterThanOrEqual(lo)
      expect(p.capacityMw).toBeLessThanOrEqual(hi)
      expect(Number.isInteger(p.capacityMw)).toBe(true)
      expect(p.lon).toBeGreaterThanOrEqual(-180)
      expect(p.lon).toBeLessThanOrEqual(-60)
      expect(p.lat).toBeGreaterThanOrEqual(15)
      expect(p.lat).toBeLessThanOrEqual(75)
      expect(isPlaceable(p.stateId)).toBe(true)
    }
  })

  it("indexes states by id in statesById", () => {
    expect(data.statesById.size).toBe(data.states.length)
    for (const s of data.states) expect(data.statesById.get(s.id)).toBe(s)
  })
})
