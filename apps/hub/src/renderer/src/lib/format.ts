/** Formate une taille en octets en libellé lisible (Ko/Mo/Go), à la française. */
export function formatBytes(bytes: number): string {
  const KB = 1024
  const MB = KB * 1024
  const GB = MB * 1024

  if (bytes < KB) return `${bytes} o`
  if (bytes < MB) return `${Math.round(bytes / KB)} Ko`
  if (bytes < GB) return `${(bytes / MB).toFixed(1).replace('.', ',')} Mo`
  return `${(bytes / GB).toFixed(1).replace('.', ',')} Go`
}
