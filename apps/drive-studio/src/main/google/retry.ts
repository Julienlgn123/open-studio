// Retry avec backoff exponentiel pour les appels Google API idempotents
// (lecture, suppression, partage...). Ne pas utiliser sur un flux d'upload/
// download déjà entamé : un stream consommé ne peut pas être rejoué.

interface RetryOpts {
  retries?: number
  baseDelayMs?: number
}

interface GaxiosLikeError {
  code?: number | string
  response?: { status?: number }
  message?: string
}

function isRetryable(err: unknown): boolean {
  const e = err as GaxiosLikeError
  const status = e?.response?.status ?? (typeof e?.code === 'number' ? e.code : undefined)
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true
  }
  const code = typeof e?.code === 'string' ? e.code : ''
  return code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNABORTED'
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Ré-essaie `fn` avec backoff exponentiel + jitter sur les erreurs transitoires (429/5xx/réseau). */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const retries = opts.retries ?? 4
  const baseDelayMs = opts.baseDelayMs ?? 500
  let attempt = 0
  for (;;) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= retries || !isRetryable(err)) throw err
      const delay = baseDelayMs * 2 ** attempt + Math.random() * 250
      await sleep(delay)
      attempt++
    }
  }
}
