// Lets TypeScript accept file imports, which resolve to a path.
declare module "*.png" {
  const path: string
  export default path
}
