import { readdirSync, statSync } from 'fs'
import { join } from 'path'

/**
 * Parcours récursif synchrone : on l'utilise seulement à la demande (un clic
 * sur une carte installée), jamais en boucle sur tout le catalogue, donc le
 * coût bloquant d'un `readdirSync`/`statSync` récursif reste acceptable et
 * évite la complexité d'une version async pour un usage aussi ponctuel.
 */
export function dirSize(path: string): number {
  let total = 0
  let entries: string[] = []
  try {
    entries = readdirSync(path)
  } catch {
    // Dossier introuvable/illisible : taille inconnue pour cette branche, pas fatal.
    return 0
  }

  for (const name of entries) {
    const full = join(path, name)
    try {
      const st = statSync(full)
      if (st.isDirectory()) {
        total += dirSize(full)
      } else if (st.isFile()) {
        total += st.size
      }
    } catch {
      // Un fichier verrouillé/supprimé entre-temps ou une permission refusée
      // ne doit pas faire échouer tout le calcul — on l'ignore et on continue.
    }
  }
  return total
}
