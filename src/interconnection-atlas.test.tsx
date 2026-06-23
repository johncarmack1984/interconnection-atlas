import "@testing-library/jest-dom/vitest"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import * as d3 from "d3"
import {
  InterconnectionAtlas,
  type IsoOutlineCollection,
  type QueueProject,
  type RegionCollection,
} from "./index"

afterEach(cleanup)

// Minimal square polygons around real US locations so geoAlbersUsa can both fit
// the regions and project the point coordinates (it clips anything off the US).
const square = (cx: number, cy: number, d = 1.5): number[][][] => [
  [
    [cx - d, cy - d],
    [cx + d, cy - d],
    [cx + d, cy + d],
    [cx - d, cy + d],
    [cx - d, cy - d],
  ],
]

const regions: RegionCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "06",
      properties: { name: "California" },
      geometry: { type: "Polygon", coordinates: square(-119, 37) },
    },
    {
      type: "Feature",
      id: "48",
      properties: { name: "Texas" },
      geometry: { type: "Polygon", coordinates: square(-99, 31) },
    },
  ],
}

const isoOutlines: IsoOutlineCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { iso: "CAISO", name: "California ISO", color: "#f6a04d" },
      geometry: { type: "Polygon", coordinates: square(-119, 37) },
    },
  ],
}

const projects: QueueProject[] = [
  { id: "p1", name: "Alpha Solar", lon: -119, lat: 37, capacityMw: 1500, fuel: "solar", status: "active", stateId: "06", iso: "CAISO", queueYear: 2023 },
  { id: "p2", name: "Beta Storage", lon: -99, lat: 31, capacityMw: 300, fuel: "storage", status: "withdrawn", stateId: "48", iso: "ERCOT", queueYear: 2022 },
]

const baseProps = {
  regions,
  isoOutlines,
  values: new Map<string, number>([
    ["06", 100],
    ["48", 40],
  ]),
  domain: [0, 100] as [number, number],
  colorInterpolator: d3.interpolateGreens,
  valueLabel: "Hosting capacity (MW)",
  formatValue: (n: number) => `${n} MW`,
  projects,
}

const firstStatePath = (root: HTMLElement) =>
  root.querySelector('path[fill]:not([fill="none"])') as SVGPathElement

describe("<InterconnectionAtlas>", () => {
  it("labels the svg with the active metric", () => {
    render(<InterconnectionAtlas {...baseProps} />)
    const svg = screen.getByRole("img")
    expect(svg.getAttribute("aria-label")).toContain("Hosting capacity (MW)")
  })

  it("draws one fillable path per region and one outline per ISO", () => {
    const { container } = render(<InterconnectionAtlas {...baseProps} />)
    const paths = Array.from(container.querySelectorAll("path"))
    const outlines = paths.filter((p) => p.getAttribute("fill") === "none")
    const states = paths.filter((p) => p.getAttribute("fill") !== "none")
    expect(outlines).toHaveLength(isoOutlines.features.length)
    expect(states).toHaveLength(regions.features.length)
  })

  it("plots one circle per project plus the four status-legend swatches", () => {
    const { container } = render(<InterconnectionAtlas {...baseProps} />)
    expect(container.querySelectorAll("circle")).toHaveLength(projects.length + 4)
  })

  it("renders the ISO code label and both legend titles", () => {
    render(<InterconnectionAtlas {...baseProps} />)
    expect(screen.getByText("CAISO")).toBeInTheDocument()
    expect(screen.getByText("Queue project status")).toBeInTheDocument()
    expect(screen.getAllByText("Hosting capacity (MW)").length).toBeGreaterThanOrEqual(1)
  })

  it("shows a tooltip with the formatted value when a state is hovered", () => {
    const { container } = render(<InterconnectionAtlas {...baseProps} />)
    fireEvent.pointerOver(firstStatePath(container))
    // Scope to the tooltip: the value "100 MW" also appears on the legend's max tick.
    const tip = container.querySelector(".atlas-tooltip") as HTMLElement
    expect(tip).toBeInTheDocument()
    expect(within(tip).getByText("California")).toBeInTheDocument()
    expect(within(tip).getByText("100 MW")).toBeInTheDocument()
  })

  it("calls onSelectState with the clicked region id", () => {
    const onSelectState = vi.fn()
    const { container } = render(
      <InterconnectionAtlas {...baseProps} onSelectState={onSelectState} />
    )
    fireEvent.click(firstStatePath(container))
    expect(onSelectState).toHaveBeenCalledWith("06")
  })
})
