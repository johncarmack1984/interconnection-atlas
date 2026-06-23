import "@testing-library/jest-dom/vitest"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { DetailPanel } from "./detail-panel"
import type { Metric, StateDatum } from "../data/dataset"
import type { QueueProject } from "interconnection-atlas"

afterEach(cleanup)

const projects: QueueProject[] = [
  { id: "a", name: "Alpha", lon: -119, lat: 37, capacityMw: 1500, fuel: "solar", status: "active", stateId: "06", iso: "CAISO", queueYear: 2026 },
  { id: "b", name: "Beta", lon: -119, lat: 37, capacityMw: 500, fuel: "storage", status: "withdrawn", stateId: "06", iso: "CAISO", queueYear: 2026 },
  { id: "c", name: "Gamma", lon: -99, lat: 31, capacityMw: 1000, fuel: "wind", status: "active", stateId: "48", iso: "ERCOT", queueYear: 2026 },
]
const states: StateDatum[] = [
  { id: "06", name: "California", iso: "CAISO", values: { proposedGw: 10 } },
  { id: "48", name: "Texas", iso: "ERCOT", values: { proposedGw: 20 } },
]
const statesById = new Map(states.map((s) => [s.id, s]))
const metrics: Metric[] = [
  {
    key: "proposedGw", short: "Proposed", hint: "", label: "Proposed (GW)",
    interpolator: () => "#000", format: (n) => String(n), unit: "GW",
    aggregate: (st) => st.reduce((s, x) => s + (x.values.proposedGw ?? 0), 0),
  },
]
const base = { projects, states, statesById, metrics, onClear: () => {} }

describe("<DetailPanel>", () => {
  it("rolls metrics up nationally via the aggregator when nothing is selected", () => {
    render(<DetailPanel {...base} selectedStateId={null} />)
    expect(screen.getByText("All ISO/RTO regions")).toBeInTheDocument()
    expect(screen.getByText("30 GW")).toBeInTheDocument() // aggregate(10 + 20)
  })

  it("scopes the metric value and the capacity mix to the selected state", () => {
    render(<DetailPanel {...base} selectedStateId="06" />)
    expect(screen.getByRole("heading", { name: "California" })).toBeInTheDocument()
    expect(screen.getByText("CAISO")).toBeInTheDocument()
    // Scoped to CA: the state's own value, not the national sum.
    expect(screen.getByText("10 GW")).toBeInTheDocument()
    // CA capacity mix: solar 1500 + storage 500 = 2000 → 75% / 25% (Texas's wind excluded).
    expect(screen.getByText("75%")).toBeInTheDocument()
    expect(screen.getByText("25%")).toBeInTheDocument()
  })

  it("formats capacity with the MW→GW rollover in the mix-bar titles", () => {
    render(<DetailPanel {...base} selectedStateId="06" />)
    expect(screen.getByTitle("Solar: 1.5 GW")).toBeInTheDocument() // 1500 MW rolls to GW
    expect(screen.getByTitle("Battery storage: 500 MW")).toBeInTheDocument() // < 1000 stays MW
  })

  it("renders 'no data' for an empty mix bar", () => {
    render(<DetailPanel {...base} projects={[]} selectedStateId={null} />)
    expect(screen.getByRole("img", { name: /Capacity by type: no data/ })).toBeInTheDocument()
    expect(screen.getByRole("img", { name: /Requests by status: no data/ })).toBeInTheDocument()
  })

  it("fires onClear from the selected-state close button", () => {
    const onClear = vi.fn()
    render(<DetailPanel {...base} selectedStateId="06" onClear={onClear} />)
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })
})
