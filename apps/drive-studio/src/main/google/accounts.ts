import {
  addLog,
  createAccount,
  createFileMeta,
  deleteAccount,
  driveIdsForAccount,
  getAccount,
  getAccountByEmail,
  getAccounts,
  getFileByDriveId,
  pruneMissingFiles,
  setAccountTokens,
  updateAccount,
  updateFileMeta
} from '../db'
import { getQuota, listFiles } from './drive'
import { mapDriveError } from './errors'
import { revokeAccount, runOAuthFlow, getAuthedClient } from './oauth'
import { broadcast } from '../events'
import type { Account, AccountRole } from '@shared/types'

/** Lance le flow OAuth et enregistre le compte (ou met à jour s'il existe déjà). */
export async function addAccount(): Promise<Account> {
  const { tokens, email } = await runOAuthFlow()

  const existing = getAccountByEmail(email)
  if (existing) {
    // Recolle simplement les nouveaux tokens + quota.
    const q = await getQuota(existing.id).catch(() => null)
    updateAccount(existing.id, {
      status: 'active',
      quotaTotal: q?.total ?? existing.quotaTotal,
      quotaUsed: q?.used ?? existing.quotaUsed,
      lastSync: Date.now()
    })
    await syncAccountFiles(existing.id).catch(() => 0)
    addLog({ action: 'account_add', accountId: existing.id, status: 'success', label: email })
    return getAccount(existing.id)!
  }

  const tmp = createAccount({
    email,
    tokens,
    quotaTotal: 0,
    quotaUsed: 0,
    role: getAccounts().length === 0 ? 'primary' : 'primary'
  })

  try {
    const q = await getQuota(tmp.id)
    updateAccount(tmp.id, {
      quotaTotal: q.total,
      quotaUsed: q.used,
      lastSync: Date.now()
    })
  } catch (err) {
    updateAccount(tmp.id, { status: 'error' })
    addLog({
      action: 'account_add',
      accountId: tmp.id,
      status: 'failed',
      label: email,
      errorDetails: err instanceof Error ? err.message : String(err)
    })
    return getAccount(tmp.id)!
  }

  // Répertorie immédiatement ce qui est déjà sur ce Drive.
  const imported = await syncAccountFiles(tmp.id).catch(() => 0)
  addLog({
    action: 'account_add',
    accountId: tmp.id,
    status: 'success',
    label: `${email}${imported ? ` · ${imported} fichier(s) déjà présents` : ''}`
  })
  return getAccount(tmp.id)!
}

/**
 * Relance le flow OAuth pour un compte existant (typiquement en statut
 * 'error' suite à un refresh_token expiré/révoqué) et remplace ses tokens.
 * Refuse si l'e-mail obtenu ne correspond pas au compte visé.
 */
export async function reconnectAccount(accountId: string): Promise<Account> {
  const acc = getAccount(accountId)
  if (!acc) throw new Error('Compte introuvable : ' + accountId)

  const { tokens, email } = await runOAuthFlow()
  if (email.toLowerCase() !== acc.email.toLowerCase()) {
    throw new Error(
      `Le compte Google connecté (${email}) ne correspond pas à ${acc.email}. ` +
        'Reconnecte-toi avec le bon compte Google.'
    )
  }

  setAccountTokens(accountId, tokens)
  updateAccount(accountId, { status: 'active' })

  try {
    const q = await getQuota(accountId)
    updateAccount(accountId, { quotaTotal: q.total, quotaUsed: q.used, lastSync: Date.now() })
  } catch {
    // le compte reste 'active' : la quota sera retentée au prochain sync
  }

  addLog({ action: 'account_add', accountId, status: 'success', label: `${email} · reconnecté` })
  return getAccount(accountId)!
}

/**
 * Rafraîchit les tokens de tous les comptes (typiquement au lancement de
 * l'app) : évite que le refresh_token expire faute d'utilisation, et
 * détecte tôt les comptes qui nécessitent une reconnexion manuelle.
 */
export async function refreshAllAccountTokens(): Promise<{ refreshed: number; failed: string[] }> {
  let refreshed = 0
  const failed: string[] = []
  for (const acc of getAccounts()) {
    try {
      await getAuthedClient(acc.id, { forceRefresh: true })
      if (acc.status === 'error') updateAccount(acc.id, { status: 'active' })
      refreshed++
    } catch (err) {
      failed.push(acc.email)
      updateAccount(acc.id, { status: 'error' })
      addLog({
        action: 'account_add',
        accountId: acc.id,
        status: 'failed',
        label: `${acc.email} · refresh token au démarrage`,
        errorDetails: err instanceof Error ? err.message : String(err)
      })
    }
  }
  broadcast('accounts:tokensRefreshed', { refreshed, failed })
  return { refreshed, failed }
}

export async function removeAccount(accountId: string): Promise<void> {
  const acc = getAccount(accountId)
  await revokeAccount(accountId)
  deleteAccount(accountId)
  addLog({
    action: 'account_remove',
    accountId: null,
    status: 'success',
    label: acc?.email ?? accountId
  })
}

export function setAccountRole(accountId: string, role: AccountRole): Account {
  updateAccount(accountId, { role })
  return getAccount(accountId)!
}

/** Rafraîchit le quota d'un compte depuis Drive. */
export async function syncAccountQuota(accountId: string): Promise<Account> {
  updateAccount(accountId, { status: 'active' })
  try {
    const q = await getQuota(accountId)
    updateAccount(accountId, {
      quotaTotal: q.total,
      quotaUsed: q.used,
      lastSync: Date.now(),
      status: 'active'
    })
  } catch (err) {
    const msg = mapDriveError(err)
    updateAccount(accountId, { status: 'error' })
    addLog({
      action: 'backup',
      accountId,
      status: 'failed',
      label: 'sync quota',
      errorDetails: msg
    })
    throw new Error(msg)
  }
  return getAccount(accountId)!
}

export async function syncAllQuotas(): Promise<Account[]> {
  for (const acc of getAccounts()) {
    await syncAccountQuota(acc.id).catch(() => null)
  }
  return getAccounts()
}

const filesSyncInFlight = new Set<string>()

export interface FilesSyncResult {
  added: number
  updated: number
  removed: number
  total: number
}

/**
 * Réconcilie la liste locale des fichiers d'un compte avec le contenu réel
 * de son Google Drive :
 *  - nouveaux fichiers (créés hors de l'app) → ajoutés avec source 'drive'
 *  - nom / taille / date modifiés → mis à jour
 *  - fichiers supprimés directement sur Drive → retirés de la base
 * Renvoie le nombre d'entrées ajoutées.
 */
export async function syncAccountFiles(accountId: string): Promise<number> {
  if (filesSyncInFlight.has(accountId)) return 0
  filesSyncInFlight.add(accountId)
  try {
    const remote = await listFiles(accountId, {
      onPage: (count) =>
        broadcast('account:filesScanning', { accountId, count })
    })

    let added = 0
    let updated = 0
    for (const rf of remote) {
      const existing = getFileByDriveId(accountId, rf.id)
      const modifiedAt = Date.parse(rf.modifiedTime) || Date.now()
      if (!existing) {
        createFileMeta({
          driveFileId: rf.id,
          accountId,
          originalFilename: rf.name,
          fileSize: rf.size,
          mimeType: rf.mimeType,
          checksum: rf.md5Checksum || '',
          source: 'drive',
          modifiedAt,
          webViewLink: rf.webViewLink
        })
        added++
      } else if (
        existing.originalFilename !== rf.name ||
        existing.fileSize !== rf.size ||
        existing.modifiedAt !== modifiedAt
      ) {
        updateFileMeta(existing.id, {
          originalFilename: rf.name,
          fileSize: rf.size,
          mimeType: rf.mimeType,
          modifiedAt,
          webViewLink: rf.webViewLink,
          ...(rf.md5Checksum && !existing.checksum ? { checksum: rf.md5Checksum } : {})
        })
        updated++
      }
    }

    const present = new Set(remote.map((r) => r.id))
    // Sécurité : ne pas purger si la liste est vide alors qu'on connaissait des
    // fichiers (souvent un souci d'API transitoire).
    const known = driveIdsForAccount(accountId)
    let removed = 0
    if (!(present.size === 0 && known.size > 3)) {
      removed = pruneMissingFiles(accountId, present)
    }

    broadcast('account:filesSynced', {
      accountId,
      result: { added, updated, removed, total: remote.length } as FilesSyncResult
    })
    if (added || removed) {
      addLog({
        action: 'backup',
        accountId,
        status: 'success',
        label: `scan Drive : ${added} ajouté(s), ${removed} disparu(s), ${remote.length} au total`
      })
    }
    return added
  } finally {
    filesSyncInFlight.delete(accountId)
  }
}

/** Scanne le contenu Drive de tous les comptes (séquentiel, best effort). */
export async function syncAllFiles(): Promise<void> {
  for (const acc of getAccounts()) {
    if (acc.status === 'error') continue
    await syncAccountFiles(acc.id).catch(() => null)
  }
}
