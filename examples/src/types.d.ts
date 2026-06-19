// us-atlas ships large TopoJSON files. Declare them as `any` so TypeScript does
// not try to infer a multi-megabyte literal type from the JSON (slow + useless).
declare module "us-atlas/states-10m.json" {
  const topology: unknown
  export default topology
}
