import "@testing-library/jest-dom/vitest"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import App from "./App"

afterEach(cleanup)

// Integration tests for the demo's cross-dataset state machine — the part that
// reconciles the selected metric when the data source changes, and threads
// selection + projectYearLabel down to the map.
describe("<App>", () => {
  it("defaults to real data with exactly one checked choropleth metric and a drawn map", () => {
    render(<App />)
    expect(screen.getByRole("radio", { name: "Real data" })).toHaveAttribute("aria-checked", "true")
    const metric = screen.getByRole("radiogroup", { name: "Choropleth metric" })
    const checked = within(metric)
      .getAllByRole("radio")
      .filter((r) => r.getAttribute("aria-checked") === "true")
    expect(checked).toHaveLength(1)
    // The choropleth rendered real states (each is a button).
    expect(screen.getByRole("button", { name: /California/ })).toBeInTheDocument()
  })

  it("swaps the dataset on the source toggle and keeps a valid checked metric", () => {
    render(<App />)
    fireEvent.click(screen.getByRole("radio", { name: "Synthetic" }))
    expect(screen.getByRole("radio", { name: "Synthetic" })).toHaveAttribute("aria-checked", "true")
    expect(screen.getByRole("radio", { name: "Real data" })).toHaveAttribute("aria-checked", "false")
    // The metric key is reset to the new dataset's first metric — still exactly one checked,
    // never an empty choropleth.
    const metric = screen.getByRole("radiogroup", { name: "Choropleth metric" })
    expect(
      within(metric)
        .getAllByRole("radio")
        .filter((r) => r.getAttribute("aria-checked") === "true")
    ).toHaveLength(1)
  })

  it("clears a selected state when the data source changes", () => {
    render(<App />)
    fireEvent.click(screen.getByRole("button", { name: /California/ }))
    // Detail panel scopes to the selection.
    expect(screen.getByRole("heading", { name: "California" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("radio", { name: "Synthetic" }))
    // changeSource resets selection → back to the national view.
    expect(screen.getByRole("heading", { name: "All ISO/RTO regions" })).toBeInTheDocument()
  })

  it("labels the per-project tooltip year 'Planned online' in real mode", () => {
    const { container } = render(<App />)
    fireEvent.pointerOver(container.querySelector("circle") as SVGCircleElement)
    const tip = container.querySelector(".atlas-tooltip") as HTMLElement
    expect(within(tip).getByText("Planned online")).toBeInTheDocument()
  })
})
