import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'crypto'

// Chiffrement par mot de passe pour les secrets (tokens OAuth, identifiants
// Google) inclus dans un export/import — contrairement à `crypto.ts`
// (safeStorage, lié à la machine/l'utilisateur OS courant), ce format doit
// pouvoir être déchiffré sur UNE AUTRE machine : la clé dérive donc d'une
// passphrase que l'utilisateur choisit et retape à l'import.

const PREFIX = 'xfer1:'
const KEY_LEN = 32
const IV_LEN = 12
const SALT_LEN = 16

export function encryptWithPassphrase(plain: string, passphrase: string): string {
  if (!plain) return ''
  const salt = randomBytes(SALT_LEN)
  const key = scryptSync(passphrase, salt, KEY_LEN)
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf-8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + Buffer.concat([salt, iv, tag, ciphertext]).toString('base64')
}

export function decryptWithPassphrase(stored: string, passphrase: string): string {
  if (!stored) return ''
  if (!stored.startsWith(PREFIX)) {
    throw new Error("Format de secret chiffré inattendu dans l'archive.")
  }
  const buf = Buffer.from(stored.slice(PREFIX.length), 'base64')
  const salt = buf.subarray(0, SALT_LEN)
  const iv = buf.subarray(SALT_LEN, SALT_LEN + IV_LEN)
  const tag = buf.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + 16)
  const ciphertext = buf.subarray(SALT_LEN + IV_LEN + 16)
  const key = scryptSync(passphrase, salt, KEY_LEN)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf-8')
  } catch {
    throw new Error('Mot de passe incorrect (ou archive corrompue).')
  }
}
