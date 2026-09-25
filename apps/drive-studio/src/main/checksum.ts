import { createHash } from 'crypto'
import { createReadStream } from 'fs'
import { Transform, type TransformCallback } from 'stream'

/** SHA-256 hex d'un fichier local, en streaming. */
export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

/**
 * Transform qui laisse passer les octets tels quels tout en :
 *  - calculant un SHA-256 au fil de l'eau (récupérable via getHash())
 *  - notifiant la progression (octets cumulés) via onProgress
 */
export class HashingCounterStream extends Transform {
  private hash = createHash('sha256')
  private bytes = 0
  private onProgress?: (bytes: number) => void

  constructor(onProgress?: (bytes: number) => void) {
    super()
    this.onProgress = onProgress
  }

  _transform(chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback): void {
    this.hash.update(chunk)
    this.bytes += chunk.length
    this.onProgress?.(this.bytes)
    cb(null, chunk)
  }

  getHash(): string {
    return this.hash.digest('hex')
  }

  get byteCount(): number {
    return this.bytes
  }
}

/** Compteur d'octets simple (progression sans hash). */
export class CounterStream extends Transform {
  private bytes = 0
  private onProgress?: (bytes: number) => void

  constructor(onProgress?: (bytes: number) => void) {
    super()
    this.onProgress = onProgress
  }

  _transform(chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback): void {
    this.bytes += chunk.length
    this.onProgress?.(this.bytes)
    cb(null, chunk)
  }

  get byteCount(): number {
    return this.bytes
  }
}
