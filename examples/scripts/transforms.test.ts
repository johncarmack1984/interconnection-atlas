import { describe, it, expect } from "vitest"
import {
  countPts,
  num,
  rdp,
  resolver,
  ring,
  ringSpan,
  simplifyGeometry,
  statusFor,
  techToFuel,
} from "./transforms"

describe("techToFuel", () => {
  it.each([
    ["Solar Photovoltaic", "solar"],
    ["Onshore Wind Turbine", "wind"],
    ["Offshore Wind Turbine", "wind"],
    ["Batteries", "storage"],
    ["Pumped Storage", "storage"],
    ["Natural Gas Fired Combined Cycle", "gas"],
  ])("maps %s -> %s", (tech, fuel) => {
    expect(techToFuel(tech)).toBe(fuel)
  })
  it.each(["Conventional Hydroelectric", "Nuclear", "Geothermal", "Wood/Wood Waste Biomass"])(
    "drops non-mappable tech %s",
    (tech) => {
      expect(techToFuel(tech)).toBeNull()
    }
  )
})

describe("statusFor", () => {
  it.each([
    ["(P) Planned, regulatory approvals not initiated", "under-study"],
    ["(L) Regulatory approvals pending", "under-study"],
    ["(TS) Construction complete, not yet in commercial operation", "operational"],
    ["(V) Under construction, more than 50% complete", "active"],
    ["(U) Under construction, <= 50% complete", "active"],
    ["(T) Regulatory approvals received", "active"],
  ])("maps %s", (raw, out) => {
    expect(statusFor(raw)).toBe(out)
  })
  it("falls back to the bare code when there are no parens", () => {
    expect(statusFor("P")).toBe("under-study")
    expect(statusFor("ts")).toBe("operational")
  })
})

describe("num", () => {
  it("parses plain and comma-grouped numbers", () => {
    expect(num(1234)).toBe(1234)
    expect(num("1,234")).toBe(1234)
    expect(num("1,234,567")).toBe(1234567)
    expect(num("12.5")).toBeCloseTo(12.5)
  })
  it("returns NaN for null/undefined/empty", () => {
    expect(num(null)).toBeNaN()
    expect(num(undefined)).toBeNaN()
    expect(num("")).toBeNaN()
  })
})

describe("rdp", () => {
  it("drops collinear midpoints", () => {
    expect(rdp([[0, 0], [1, 1], [2, 2]], 0.01)).toEqual([[0, 0], [2, 2]])
  })
  it("keeps a vertex that deviates beyond epsilon", () => {
    expect(rdp([[0, 0], [1, 5], [2, 0]], 0.5)).toHaveLength(3)
  })
  it("returns short inputs unchanged", () => {
    expect(rdp([[0, 0], [1, 1]], 0.1)).toEqual([[0, 0], [1, 1]])
  })
})

describe("ringSpan", () => {
  it("is the bounding-box diagonal", () => {
    expect(ringSpan([[0, 0], [3, 4]])).toBeCloseTo(5)
    expect(ringSpan([[1, 1], [1, 1]])).toBe(0)
  })
})

describe("ring", () => {
  it("rounds retained coordinates to 3 decimals", () => {
    const out = ring([[0.123456, 1.234567], [9.999999, -0.55555], [0.123456, 1.234567]])
    for (const [x, y] of out) {
      expect(x).toBe(Math.round(x * 1000) / 1000)
      expect(y).toBe(Math.round(y * 1000) / 1000)
    }
  })
})

describe("countPts", () => {
  it("counts coordinate pairs in a polygon ring", () => {
    expect(countPts({ coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] })).toBe(4)
  })
  it("counts across a multipolygon", () => {
    expect(
      countPts({
        coordinates: [
          [[[0, 0], [1, 0], [0, 0]]],
          [[[5, 5], [6, 5], [6, 6], [5, 5]]],
        ],
      })
    ).toBe(7)
  })
})

describe("simplifyGeometry", () => {
  it("keeps a well-formed polygon ring (>= 4 pts)", () => {
    const square = {
      type: "Polygon",
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
    }
    const out = simplifyGeometry(square) as { type: string; coordinates: number[][][] }
    expect(out.type).toBe("Polygon")
    expect(out.coordinates).toHaveLength(1)
    expect(out.coordinates[0].length).toBeGreaterThanOrEqual(4)
  })
  it("drops a degenerate sliver ring (< 4 simplified pts)", () => {
    const sliver = { type: "Polygon", coordinates: [[[0, 0], [0.001, 0], [0, 0.001]]] }
    const out = simplifyGeometry(sliver) as { coordinates: number[][][] }
    expect(out.coordinates).toHaveLength(0)
  })
  it("passes non-polygon geometry through unchanged", () => {
    const pt = { type: "Point", coordinates: [1, 2] }
    expect(simplifyGeometry(pt)).toEqual(pt)
  })
})

describe("resolver", () => {
  const sample = { "Plant State": "TX", "Nameplate Capacity (MW)": 100, Technology: "Solar" }
  it("matches a header exactly (case-insensitive)", () => {
    expect(resolver(sample)("plant state")).toBe("Plant State")
  })
  it("falls back to a substring match", () => {
    expect(resolver(sample)("Nameplate Capacity")).toBe("Nameplate Capacity (MW)")
  })
  it("tries candidates in order, preferring an exact hit", () => {
    expect(resolver(sample)("Plant Code", "Plant State")).toBe("Plant State")
  })
  it("returns null when nothing matches", () => {
    expect(resolver(sample)("Latitude")).toBeNull()
  })
})
