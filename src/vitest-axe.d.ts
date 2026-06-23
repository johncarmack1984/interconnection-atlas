// Registers vitest-axe's `toHaveNoViolations` on Vitest's expect *types*. The
// package only augments the legacy `Vi` namespace, which Vitest 4 ignores, so
// declare it against the `vitest` module directly. The matcher itself is wired at
// runtime in vitest.setup.ts.
import "vitest"

interface AxeMatchers<R = unknown> {
  toHaveNoViolations(): R
}

declare module "vitest" {
  interface Assertion<T = any> extends AxeMatchers<T> {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
