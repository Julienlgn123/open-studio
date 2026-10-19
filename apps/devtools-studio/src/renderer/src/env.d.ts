declare module 'js-yaml' {
  export function load(text: string): unknown
  export function dump(data: unknown, opts?: Record<string, unknown>): string
  const yaml: { load: typeof load; dump: typeof dump }
  export default yaml
}
