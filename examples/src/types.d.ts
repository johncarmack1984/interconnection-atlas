// us-atlas ships large TopoJSON files. Declare them as `any` so TypeScript does
// not try to infer a multi-megabyte literal type from the JSON (slow + useless).
declare module "us-atlas/states-10m.json" {
  const topology: unknown
  export default topology
}

// Vendored real-data JSON (built by scripts/build-real-data.ts). Typed as
// `unknown` for the same reason — avoid inferring a huge literal type from the
// file — and cast to the right shape at the import site.
declare module "*/real/iso-outlines.json" {
  const v: unknown
  export default v
}
declare module "*/real/projects.json" {
  const v: unknown
  export default v
}
declare module "*/real/state-metrics.json" {
  const v: unknown
  export default v
}
declare module "*/real/meta.json" {
  const v: unknown
  export default v
}
