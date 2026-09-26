export function formatBytes(n: number | null): string {
  if (!n) return ''
  const gb = n / 1024 ** 3
  if (gb >= 1) return `${gb.toFixed(1)} Go`
  return `${(n / 1024 ** 2).toFixed(0)} Mo`
}
