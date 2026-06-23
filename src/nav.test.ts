import { describe, expect, it } from "vitest"
import { nearestInDirection, type Centroid } from "./nav"

// A small grid of screen-space centroids (y grows downward, as in SVG):
//        N (50,0)
//   W (0,50)  C (50,50)  E (100,50)
//        S (50,100)
const grid = new Map<string, Centroid>([
  ["C", [50, 50]],
  ["N", [50, 0]],
  ["S", [50, 100]],
  ["E", [100, 50]],
  ["W", [0, 50]],
])

describe("nearestInDirection", () => {
  it("picks the neighbor in the pressed direction", () => {
    expect(nearestInDirection(grid, "C", 1, 0)).toBe("E") // right
    expect(nearestInDirection(grid, "C", -1, 0)).toBe("W") // left
    expect(nearestInDirection(grid, "C", 0, -1)).toBe("N") // up (screen y)
    expect(nearestInDirection(grid, "C", 0, 1)).toBe("S") // down
  })

  it("returns null when nothing lies ahead in that direction", () => {
    // From the east edge there is no state further right.
    expect(nearestInDirection(grid, "E", 1, 0)).toBeNull()
    expect(nearestInDirection(grid, "N", 0, -1)).toBeNull()
  })

  it("returns null for an unknown origin id", () => {
    expect(nearestInDirection(grid, "Z", 1, 0)).toBeNull()
  })

  it("never returns the origin itself", () => {
    const single = new Map<string, Centroid>([["only", [10, 10]]])
    expect(nearestInDirection(single, "only", 1, 0)).toBeNull()
  })

  it("favors an axis-aligned neighbor over a closer but off-axis one", () => {
    // Pressing right: 'aligned' sits dead ahead at distance 30; 'offaxis' is
    // closer along the axis (20) but far off it (40). The perpendicular penalty
    // (×2) makes the aligned one win.
    const m = new Map<string, Centroid>([
      ["from", [0, 0]],
      ["aligned", [30, 0]],
      ["offaxis", [20, 40]],
    ])
    expect(nearestInDirection(m, "from", 1, 0)).toBe("aligned")
  })

  it("ignores candidates that are only perpendicular (along ≤ 0)", () => {
    // Directly above/below the origin contributes nothing when pressing right.
    const m = new Map<string, Centroid>([
      ["from", [0, 0]],
      ["above", [0, -50]],
      ["right", [10, 0]],
    ])
    expect(nearestInDirection(m, "from", 1, 0)).toBe("right")
  })
})
