import { safeStorage } from 'electron'
import { deleteRawPreference, getRawPreference, setRawPreference } from './db'
import type { MistralStatus } from '@shared/types'

// La clé Mistral ne quitte jamais le main process : le renderer sait seulement si elle existe.
// Elle est chiffrée avec le trousseau du système (DPAPI / Keychain / libsecret) quand il est dispo.
const KEY = 'mistralApiKey'

export function getMistralKey(): string | null {
  const raw = getRawPreference(KEY)
  if (!raw) return null
  const [kind, payload] = raw.split(':', 2)
  if (kind === 'enc') {
    try {
      return safeStorage.decryptString(Buffer.from(payload, 'base64'))
    } catch {
      return null
    }
  }
  return kind === 'plain' ? payload : null
}

export function setMistralKey(key: string): void {
  const value = safeStorage.isEncryptionAvailable()
    ? `enc:${safeStorage.encryptString(key).toString('base64')}`
    : `plain:${key}`
  setRawPreference(KEY, value)
}

export function clearMistralKey(): void {
  deleteRawPreference(KEY)
}

export function mistralStatus(): MistralStatus {
  const raw = getRawPreference(KEY)
  return { configured: !!raw && getMistralKey() !== null, encrypted: !!raw?.startsWith('enc:') }
}
