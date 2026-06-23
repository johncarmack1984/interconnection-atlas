import "@testing-library/jest-dom/vitest"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { MetricToggle } from "./metric-toggle"

afterEach(cleanup)

const options = [
  { key: "a", short: "A", hint: "Option A" },
  { key: "b", short: "B", hint: "Option B" },
  { key: "c", short: "C", hint: "Option C" },
] as const

describe("<MetricToggle>", () => {
  it("renders a labeled radiogroup with exactly one checked radio", () => {
    render(<MetricToggle options={options} value="a" onChange={() => {}} label="Pick one" />)
    expect(screen.getByRole("radiogroup", { name: "Pick one" })).toBeInTheDocument()
    const radios = screen.getAllByRole("radio")
    expect(radios).toHaveLength(3)
    expect(radios.filter((r) => r.getAttribute("aria-checked") === "true")).toHaveLength(1)
    expect(screen.getByRole("radio", { name: "A" })).toHaveAttribute("aria-checked", "true")
  })

  it("keeps a single tab stop (roving tabindex on the checked radio)", () => {
    render(<MetricToggle options={options} value="b" onChange={() => {}} label="Pick one" />)
    const tabbable = screen
      .getAllByRole("radio")
      .filter((r) => r.getAttribute("tabindex") === "0")
    expect(tabbable).toHaveLength(1)
    expect(screen.getByRole("radio", { name: "B" })).toHaveAttribute("tabindex", "0")
  })

  it("selects an option on click", () => {
    const onChange = vi.fn()
    render(<MetricToggle options={options} value="a" onChange={onChange} label="Pick one" />)
    fireEvent.click(screen.getByRole("radio", { name: "C" }))
    expect(onChange).toHaveBeenCalledWith("c")
  })

  it("moves selection with arrow keys, wrapping at the ends", () => {
    const onChange = vi.fn()
    render(<MetricToggle options={options} value="a" onChange={onChange} label="Pick one" />)
    const first = screen.getByRole("radio", { name: "A" })
    fireEvent.keyDown(first, { key: "ArrowRight" })
    expect(onChange).toHaveBeenCalledWith("b")
    // ArrowLeft from the first option wraps around to the last.
    fireEvent.keyDown(first, { key: "ArrowLeft" })
    expect(onChange).toHaveBeenLastCalledWith("c")
  })
})
