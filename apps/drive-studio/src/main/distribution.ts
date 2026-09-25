import { getAccounts } from './db'
import type { Account } from '@shared/types'

/** Espace libre estimé d'un compte (octets). */
export function freeSpace(acc: Account): number {
  return Math.max(0, acc.quotaTotal - acc.quotaUsed)
}

/**
 * Choisit le meilleur compte "primary" actif pour accueillir un fichier :
 * celui qui a le plus d'espace libre, à condition d'avoir la place (+5 % de marge).
 */
export function pickBestPrimary(fileSize: number): Account {
  const candidates = getAccounts()
    .filter((a) => a.role === 'primary' && a.status === 'active')
    .sort((a, b) => freeSpace(b) - freeSpace(a))

  if (candidates.length === 0) {
    throw new Error(
      'Aucun compte principal actif. Ajoute un compte et attribue-lui le rôle « Principal ».'
    )
  }

  const best = candidates[0]
  if (freeSpace(best) < fileSize * 1.05) {
    throw new Error(
      "Espace insuffisant sur tous les comptes principaux pour ce fichier."
    )
  }
  return best
}

/** Comptes backup actifs, triés par espace libre décroissant. */
export function backupTargets(): Account[] {
  return getAccounts()
    .filter((a) => a.role === 'backup' && a.status === 'active')
    .sort((a, b) => freeSpace(b) - freeSpace(a))
}
