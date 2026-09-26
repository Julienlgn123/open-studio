import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { encryptString, decryptString } from './crypto'
import type { AppSettings } from '@shared/types'

interface StoredSettings {
  theme?: 'dark' | 'light'
  googleClientId?: string // chiffré
  googleClientSecret?: string // chiffré
  launchAtStartup?: boolean
  encryptUploads?: boolean
  encryptionPassphrase?: string // chiffrée (trousseau de l'OS)
  /** Dernier seuil d'alerte de stockage notifié par compte (0.9, 0.95, 0.99). */
  quotaAlerts?: Record<string, number>
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function readRaw(): StoredSettings {
  try {
    return JSON.parse(readFileSync(settingsPath(), 'utf-8')) as StoredSettings
  } catch {
    return {}
  }
}

function writeRaw(s: StoredSettings): void {
  writeFileSync(settingsPath(), JSON.stringify(s, null, 2))
}

/** Version publique : jamais les secrets, seulement leur présence. */
export function getPublicSettings(): AppSettings {
  const raw = readRaw()
  return {
    theme: raw.theme ?? 'dark',
    googleConfigured: !!(raw.googleClientId && raw.googleClientSecret),
    launchAtStartup: !!raw.launchAtStartup,
    encryptUploads: !!raw.encryptUploads && !!raw.encryptionPassphrase,
    hasEncryptionPassphrase: !!raw.encryptionPassphrase
  }
}

/** Phrase de chiffrement (null si aucune). Ne quitte jamais le process main. */
export function getEncryptionPassphrase(): string | null {
  const raw = readRaw()
  return raw.encryptionPassphrase ? decryptString(raw.encryptionPassphrase) || null : null
}

export function setEncryptionPassphrase(passphrase: string): void {
  const raw = readRaw()
  raw.encryptionPassphrase = encryptString(passphrase)
  writeRaw(raw)
}

/** Chiffrer les prochains envois ? (jamais sans phrase enregistrée) */
export function encryptUploadsEnabled(): boolean {
  const raw = readRaw()
  return !!raw.encryptUploads && !!raw.encryptionPassphrase
}

export function setEncryptUploads(enabled: boolean): void {
  const raw = readRaw()
  raw.encryptUploads = enabled
  writeRaw(raw)
}

export function getQuotaAlertLevel(accountId: string): number {
  return readRaw().quotaAlerts?.[accountId] ?? 0
}

export function setQuotaAlertLevel(accountId: string, level: number): void {
  const raw = readRaw()
  raw.quotaAlerts = { ...(raw.quotaAlerts ?? {}), [accountId]: level }
  writeRaw(raw)
}

export function setTheme(theme: 'dark' | 'light'): void {
  const raw = readRaw()
  raw.theme = theme
  writeRaw(raw)
}

export function getLaunchAtStartup(): boolean {
  return !!readRaw().launchAtStartup
}

export function setLaunchAtStartup(enabled: boolean): void {
  const raw = readRaw()
  raw.launchAtStartup = enabled
  writeRaw(raw)
}

export function setGoogleCredentials(clientId: string, clientSecret: string): void {
  const raw = readRaw()
  raw.googleClientId = encryptString(clientId.trim())
  raw.googleClientSecret = encryptString(clientSecret.trim())
  writeRaw(raw)
}

export function clearGoogleCredentials(): void {
  const raw = readRaw()
  delete raw.googleClientId
  delete raw.googleClientSecret
  writeRaw(raw)
}

export function getGoogleCredentials(): { clientId: string; clientSecret: string } | null {
  const raw = readRaw()
  if (!raw.googleClientId || !raw.googleClientSecret) return null
  return {
    clientId: decryptString(raw.googleClientId),
    clientSecret: decryptString(raw.googleClientSecret)
  }
}
