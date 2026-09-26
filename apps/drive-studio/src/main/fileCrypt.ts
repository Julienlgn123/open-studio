import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import { appendFileSync, closeSync, createReadStream, createWriteStream, openSync, readSync, rmSync, statSync, writeFileSync } from 'fs'
import { pipeline } from 'stream/promises'

// Chiffrement côté client, avant l'envoi vers Google Drive : Google ne voit jamais le contenu.
// Format d'un fichier chiffré :  "DSE1" | sel (16) | iv (12) | contenu AES-256-GCM | tag (16).
// La clé est dérivée de la phrase de chiffrement (scrypt) avec un sel propre à chaque fichier.

const MAGIC = Buffer.from('DSE1')
const HEADER = MAGIC.length + 16 + 12
const TAG = 16

/** Extension ajoutée au nom sur Google Drive (le nom d'origine reste affiché dans l'app). */
export const ENCRYPTED_EXT = '.dsenc'

function keyFor(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
}

export async function encryptFile(src: string, dest: string, passphrase: string): Promise<void> {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyFor(passphrase, salt), iv)
  writeFileSync(dest, Buffer.concat([MAGIC, salt, iv]))
  await pipeline(createReadStream(src), cipher, createWriteStream(dest, { flags: 'a' }))
  appendFileSync(dest, cipher.getAuthTag())
}

export function isEncryptedFile(path: string): boolean {
  const fd = openSync(path, 'r')
  try {
    const head = Buffer.alloc(MAGIC.length)
    readSync(fd, head, 0, head.length, 0)
    return head.equals(MAGIC)
  } finally {
    closeSync(fd)
  }
}

/** Déchiffre `src` vers `dest`. Mauvaise phrase ou fichier modifié → erreur, et rien n'est écrit. */
export async function decryptFile(src: string, dest: string, passphrase: string): Promise<void> {
  const size = statSync(src).size
  if (size < HEADER + TAG || !isEncryptedFile(src)) throw new Error("Ce fichier n'est pas chiffré par Drive Studio.")
  const fd = openSync(src, 'r')
  const header = Buffer.alloc(HEADER)
  const tag = Buffer.alloc(TAG)
  try {
    readSync(fd, header, 0, HEADER, 0)
    readSync(fd, tag, 0, TAG, size - TAG)
  } finally {
    closeSync(fd)
  }
  const salt = header.subarray(MAGIC.length, MAGIC.length + 16)
  const iv = header.subarray(MAGIC.length + 16)
  const decipher = createDecipheriv('aes-256-gcm', keyFor(passphrase, salt), iv)
  decipher.setAuthTag(tag)
  try {
    if (size === HEADER + TAG) {
      // Fichier vide : on vérifie juste le tag.
      decipher.final()
      writeFileSync(dest, Buffer.alloc(0))
      return
    }
    await pipeline(createReadStream(src, { start: HEADER, end: size - TAG - 1 }), decipher, createWriteStream(dest))
  } catch {
    rmSync(dest, { force: true })
    throw new Error('Impossible de déchiffrer : phrase de chiffrement incorrecte, ou fichier abîmé.')
  }
}
