// jsdom DOM matchers (toBeInTheDocument, toHaveAttribute, …) on Vitest's expect.
import "@testing-library/jest-dom/vitest"

// axe-core accessibility matcher (toHaveNoViolations). vitest-axe ships the
// matcher separately from its runtime-empty `extend-expect` entry, so register it
// here; the matching type is declared in src/vitest-axe.d.ts (and the example's).
import { expect } from "vitest"
import * as axeMatchers from "vitest-axe/matchers"
expect.extend(axeMatchers)
