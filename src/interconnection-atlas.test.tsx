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
    // The map is a labeled group (not role="img") so AT can reach the
    // per-state buttons and the points summary inside it.
    const svg = screen.getByRole("group", { name: /Hosting capacity \(MW\)/ })
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

  it("exposes each state as a button named with its value and pressed state", () => {
    render(<InterconnectionAtlas {...baseProps} selectedStateId="06" />)
    const ca = screen.getByRole("button", { name: /California/ })
    expect(ca.getAttribute("aria-label")).toContain("100 MW")
    expect(ca).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: /Texas/ })).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })

  it("keeps a single tab stop across the states (roving tabindex)", () => {
    render(<InterconnectionAtlas {...baseProps} />)
    const tabbable = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("tabindex") === "0")
    expect(tabbable).toHaveLength(1)
  })

  it("selects a focused state on Enter and toggles it off when re-pressed", () => {
    const onSelectState = vi.fn()
    const { rerender } = render(
      <InterconnectionAtlas {...baseProps} onSelectState={onSelectState} />
    )
    fireEvent.keyDown(screen.getByRole("button", { name: /California/ }), { key: "Enter" })
    expect(onSelectState).toHaveBeenCalledWith("06")

    rerender(
      <InterconnectionAtlas {...baseProps} onSelectState={onSelectState} selectedStateId="06" />
    )
    fireEvent.keyDown(screen.getByRole("button", { name: /California/ }), { key: " " })
    expect(onSelectState).toHaveBeenLastCalledWith(null)
  })

  it("clears an active selection on Escape", () => {
    const onSelectState = vi.fn()
    render(
      <InterconnectionAtlas {...baseProps} onSelectState={onSelectState} selectedStateId="06" />
    )
    fireEvent.keyDown(screen.getByRole("button", { name: /California/ }), { key: "Escape" })
    expect(onSelectState).toHaveBeenCalledWith(null)
  })

  it("wires arrow keys to move the single roving tab stop to a neighbor", () => {
    render(<InterconnectionAtlas {...baseProps} />)
    const ca = screen.getByRole("button", { name: /California/ })
    expect(ca).toHaveAttribute("tabindex", "0") // first feature owns the tab stop
    // geoAlbersUsa.fitSize collapses this 2-square fixture, projecting Texas just
    // *above* California in screen space; ArrowUp is the direction that connects
    // them here. (Direction semantics on controlled coordinates: see nav.test.ts.)
    fireEvent.keyDown(ca, { key: "ArrowUp" })
    expect(screen.getByRole("button", { name: /Texas/ })).toHaveAttribute("tabindex", "0")
    expect(ca).toHaveAttribute("tabindex", "-1")
  })

  it("summarizes the queue projects for AT via the map's aria-describedby", () => {
    render(<InterconnectionAtlas {...baseProps} />)
    const map = screen.getByRole("group", { name: /Hosting capacity/ })
    const summary = document.getElementById(map.getAttribute("aria-describedby") ?? "")
    expect(summary).toHaveTextContent(/2 interconnection-queue projects/)
  })
})
