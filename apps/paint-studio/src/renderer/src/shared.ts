// Passerelle entre l'atelier 2D et l'atelier 3D (les deux restent montés en même temps).
// La 2D s'y enregistre au montage ; la 3D s'en sert pour prendre le dessin comme texture
// ou renvoyer un rendu 3D comme nouveau calque.

export const bridge: {
  /** Le dessin 2D aplati (calques visibles). */
  drawing: (() => HTMLCanvasElement) | null
  /** Ajoute une image comme nouveau calque dans le dessin 2D. */
  addLayer: ((c: HTMLCanvasElement, name: string) => void) | null
} = { drawing: null, addLayer: null }

export function makeCanvas(w: number, h: number, fill?: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  if (fill) {
    const ctx = c.getContext('2d')!
    ctx.fillStyle = fill
    ctx.fillRect(0, 0, c.width, c.height)
  }
  return c
}

/** Charge un fichier image du disque dans un canvas. */
export async function loadImageFile(path: string): Promise<HTMLCanvasElement> {
  const ext = path.split('.').pop()!.toLowerCase()
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : ext === 'svg' ? 'svg+xml' : ext
  return loadDataUrl(`data:image/${mime};base64,${await window.kit.files.readBase64(path)}`)
}

export async function loadDataUrl(url: string): Promise<HTMLCanvasElement> {
  const img = new Image()
  img.src = url
  await img.decode()
  const c = makeCanvas(img.naturalWidth, img.naturalHeight)
  c.getContext('2d')!.drawImage(img, 0, 0)
  return c
}

export const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'svg']
