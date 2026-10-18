import { safeStorage } from 'electron'
import { host } from '@open-studio/module'

// Chiffrement des secrets (tokens OAuth, client secret Google) au repos.
// safeStorage s'appuie sur le trousseau de l'OS :
//   - Windows : DPAPI
//   - macOS   : Keychain
//   - Linux   : libsecret / kwallet (avec repli en clair si indisponible)
//
// On préfixe la valeur chiffrée par "enc:" (base64) pour distinguer d'un
// éventuel repli en clair "raw:" quand le chiffrement n'est pas disponible.

const ENC_PREFIX = 'enc:'
const RAW_PREFIX = 'raw:'

export function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function encryptString(plain: string): string {
  if (!plain) return ''
  if (encryptionAvailable()) {
    const buf = safeStorage.encryptString(plain)
    return ENC_PREFIX + buf.toString('base64')
  }
  // Repli : on stocke en clair (base64) mais on le marque explicitement.
  return RAW_PREFIX + Buffer.from(plain, 'utf-8').toString('base64')
}

export function decryptString(stored: string | null | undefined): string {
  if (!stored) return ''
  if (stored.startsWith(ENC_PREFIX)) {
    const buf = Buffer.from(stored.slice(ENC_PREFIX.length), 'base64')
    try {
      return safeStorage.decryptString(buf)
    } catch (err) {
      // Secret écrit par l'ancienne app Drive Studio (autre clé que celle d'Open Studio).
      const legacy = host.decryptLegacy(buf)
      if (legacy !== null) return legacy
      // Clé inconnue : on traite le secret comme absent (à ressaisir / compte à reconnecter) plutôt que de planter.
      console.warn('[crypto] secret illisible, ignoré :', (err as Error).message)
      return ''
    }
  }
  if (stored.startsWith(RAW_PREFIX)) {
    return Buffer.from(stored.slice(RAW_PREFIX.length), 'base64').toString('utf-8')
  }
  // Valeur historique non préfixée : on la renvoie telle quelle.
  return stored
}
