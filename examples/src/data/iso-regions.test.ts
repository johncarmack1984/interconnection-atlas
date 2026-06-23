import { describe, expect, it } from "vitest"
import { isoForState, ISO_META, OUTLINED_ISOS } from "./iso-regions"

describe("isoForState", () => {
  it.each([
    ["California", "CAISO"],
    ["Texas", "ERCOT"],
    ["New York", "NYISO"],
    ["Massachusetts", "ISO-NE"],
    ["District of Columbia", "PJM"],
    ["North Dakota", "MISO"],
    ["Oklahoma", "SPP"],
  ])("maps %s -> %s", (name, iso) => {
    expect(isoForState(name)).toBe(iso)
  })

  it("defaults unmapped states (West / Southeast / isolated) to Non-ISO", () => {
    expect(isoForState("Florida")).toBe("Non-ISO")
    expect(isoForState("Nevada")).toBe("Non-ISO")
    expect(isoForState("Washington")).toBe("Non-ISO")
    expect(isoForState("Definitely Not A State")).toBe("Non-ISO")
  })

  it("has display metadata for every outlined ISO plus Non-ISO", () => {
    for (const iso of [...OUTLINED_ISOS, "Non-ISO"]) {
      expect(ISO_META[iso]).toBeDefined()
      expect(ISO_META[iso].name).toBeTruthy()
      expect(ISO_META[iso].color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})
