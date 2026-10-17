import { safeStorage } from 'electron'
import { host } from '@open-studio/module'
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
    const buf = Buffer.from(payload, 'base64')
    try {
      return safeStorage.decryptString(buf)
    } catch {
      // Clé enregistrée par l'ancienne app Local IA Studio (autre clé que celle d'Open Studio).
      return host.decryptLegacy(buf)
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
