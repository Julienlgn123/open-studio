import { execFileSync } from 'child_process'
import { createDecipheriv, pbkdf2Sync } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'

// Relit les secrets chiffrés par une ancienne app (tokens Google de Drive Studio, clé Mistral de
// Local IA Studio…). `safeStorage` chiffre avec une clé propre à chaque app : celle d'Open Studio
// n'est pas celle de l'ancienne app. On retrouve donc la clé de l'ancienne app, comme le fait
// Chromium, à partir de son dossier de données (Windows) ou du trousseau (macOS, Linux).

const keys = new Map<string, Buffer | null>()

/** Clé AES-256 de l'ancienne app sous Windows : `Local State` → os_crypt.encrypted_key, protégée par DPAPI. */
function windowsKey(dataDir: string): Buffer | null {
  try {
    const state = JSON.parse(readFileSync(join(dataDir, 'Local State'), 'utf-8')) as { os_crypt?: { encrypted_key?: string } }
    const enc = Buffer.from(state.os_crypt?.encrypted_key ?? '', 'base64')
    if (enc.subarray(0, 5).toString() !== 'DPAPI') return null
    const script =
      'Add-Type -AssemblyName System.Security;' +
      `$b=[Convert]::FromBase64String('${enc.subarray(5).toString('base64')}');` +
      "[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser'))"
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 15_000 })
    const key = Buffer.from(out.toString().trim(), 'base64')
    return key.length === 32 ? key : null
  } catch (err) {
    console.warn('[legacyCrypto] clé de l’ancienne app illisible :', err instanceof Error ? err.message : err)
    return null
  }
}

/** Mot de passe « <app> Safe Storage » du trousseau macOS, dérivé comme Chromium. */
function macKey(names: string[]): Buffer | null {
  for (const name of names) {
    try {
      const pw = execFileSync('security', ['find-generic-password', '-w', '-s', `${name} Safe Storage`], { timeout: 15_000 }).toString().trim()
      if (pw) return pbkdf2Sync(pw, 'saltysalt', 1003, 16, 'sha1')
    } catch {
      /* nom suivant */
    }
  }
  return null
}

function windowsDecrypt(data: Buffer, dir: string): string | null {
  if (!keys.has(dir)) keys.set(dir, windowsKey(dir))
  const key = keys.get(dir)
  if (!key) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(3, 15))
    decipher.setAuthTag(data.subarray(data.length - 16))
    return Buffer.concat([decipher.update(data.subarray(15, data.length - 16)), decipher.final()]).toString('utf-8')
  } catch {
    return null // pas cette clé-là
  }
}

/**
 * Déchiffre une valeur produite par `safeStorage.encryptString` dans une ancienne app. `dataDirs` :
 * dossiers de données dont la clé a pu servir (l'ancienne app, un ancien Open Studio).
 * `null` si ce n'est pas possible (autre ordinateur, trousseau refusé…).
 */
export function decryptLegacy(data: Buffer, dataDirs: string[], appNames: string[]): string | null {
  const prefix = data.subarray(0, 3).toString()
  try {
    if (process.platform === 'win32') {
      if (prefix !== 'v10') return null
      for (const dir of dataDirs) {
        const plain = windowsDecrypt(data, dir)
        if (plain !== null) return plain
      }
      console.warn('[legacyCrypto] aucune clé connue ne déchiffre ce secret')
      return null
    }
    // macOS et Linux : AES-128-CBC, IV de 16 espaces.
    let key: Buffer | null
    if (process.platform === 'darwin') {
      const id = `mac:${appNames.join('|')}`
      if (!keys.has(id)) keys.set(id, macKey(appNames))
      key = keys.get(id) ?? null
    } else {
      // Linux « v10 » : mot de passe fixe de Chromium (le « v11 » du trousseau n'est pas géré).
      key = prefix === 'v10' ? pbkdf2Sync('peanuts', 'saltysalt', 1, 16, 'sha1') : null
    }
    if (!key || (prefix !== 'v10' && prefix !== 'v11')) return null
    const decipher = createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, ' '))
    return Buffer.concat([decipher.update(data.subarray(3)), decipher.final()]).toString('utf-8')
  } catch (err) {
    console.warn('[legacyCrypto] déchiffrement impossible :', err instanceof Error ? err.message : err)
    return null
  }
}
