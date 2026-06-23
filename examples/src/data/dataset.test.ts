import { describe, it, expect } from "vitest"
import {
  compact,
  isPlaceable,
  loadRegions,
  medianOf,
  round0,
  sumOf,
  type StateDatum,
} from "./dataset"

const st = (values: Record<string, number>): StateDatum => ({
  id: "00",
  name: "Test",
  iso: "Non-ISO",
  values,
})

describe("sumOf", () => {
  it("sums the keyed metric across states", () => {
    expect(sumOf("x")([st({ x: 1 }), st({ x: 2 }), st({ x: 3 })])).toBe(6)
  })
  it("treats a missing key as 0", () => {
    expect(sumOf("x")([st({ x: 5 }), st({ y: 9 })])).toBe(5)
  })
  it("is 0 for no states", () => {
    expect(sumOf("x")([])).toBe(0)
  })
})

describe("medianOf", () => {
  it("returns the middle value for odd counts", () => {
    expect(medianOf("w")([st({ w: 30 }), st({ w: 10 }), st({ w: 20 })])).toBe(20)
  })
  it("averages the two middles (rounded) for even counts", () => {
    expect(
      medianOf("w")([st({ w: 10 }), st({ w: 20 }), st({ w: 30 }), st({ w: 40 })])
    ).toBe(25)
  })
  it("is 0 for no states", () => {
    expect(medianOf("w")([])).toBe(0)
  })
})

describe("compact", () => {
  it.each<[number, string]>([
    [0, "0"],
    [42, "42"],
    [999, "999"],
    [1000, "1.0k"],
    [9500, "9.5k"],
    [10000, "10k"],
    [12000, "12k"],
  ])("formats %i as %s", (n, out) => {
    expect(compact(n)).toBe(out)
  })
})

describe("round0", () => {
  it("rounds to a whole-number string", () => {
    expect(round0(3.4)).toBe("3")
    expect(round0(3.6)).toBe("4")
    expect(round0(25)).toBe("25")
  })
})

describe("isPlaceable", () => {
  it("accepts FIPS < 60 (states + DC)", () => {
    expect(isPlaceable("06")).toBe(true)
    expect(isPlaceable("48")).toBe(true)
    expect(isPlaceable(11)).toBe(true)
  })
  it("rejects territories (FIPS >= 60) and undefined", () => {
    expect(isPlaceable("60")).toBe(false)
    expect(isPlaceable("72")).toBe(false)
    expect(isPlaceable(undefined)).toBe(false)
  })
})

describe("loadRegions", () => {
  it("returns a FeatureCollection of US states with FIPS ids + names", () => {
    const regions = loadRegions()
    expect(regions.type).toBe("FeatureCollection")
    expect(regions.features.length).toBeGreaterThanOrEqual(51)
    const ca = regions.features.find((f) => Number(f.id) === 6)
    expect(ca?.properties.name).toBe("California")
  })
  it("yields >= 51 placeable states once territories are filtered out", () => {
    const placeable = loadRegions().features.filter((f) => isPlaceable(f.id))
    expect(placeable.length).toBeGreaterThanOrEqual(51)
  })
})
