// Registers vitest-axe's `toHaveNoViolations` on Vitest's expect *types* for the
// example's TS project (which type-checks its test files). The package only
// augments the legacy `Vi` namespace, which Vitest 4 ignores. Matcher runtime is
// wired in the root vitest.setup.ts.
import "vitest"

interface AxeMatchers<R = unknown> {
  toHaveNoViolations(): R
}

declare module "vitest" {
  interface Assertion<T = any> extends AxeMatchers<T> {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
