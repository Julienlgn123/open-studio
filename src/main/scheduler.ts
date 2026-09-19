import { Notification } from 'electron'
import {
  addLog,
  computeNextRun,
  getDueSchedules,
  getAccount,
  updateSchedule
} from './db'
import { runScheduledBackup, isBackupRunning } from './backup'
import { refreshAllAccountTokens } from './google/accounts'
import { revokeExpiredShares } from './filesvc'

let timer: NodeJS.Timeout | null = null
let shareTimer: NodeJS.Timeout | null = null
let tickCount = 0

// Un refresh de tokens toutes les 30 ticks (~30 min, ticks à 60 s) : assez
// fréquent pour détecter rapidement un compte à reconnecter même si l'app
// tourne cachée en tray, sans pour autant taper l'endpoint de refresh Google
// pour chaque compte à chaque tick (gaspillage + risque de rate-limiting).
const TOKEN_REFRESH_EVERY_N_TICKS = 30

/** Vérifie toutes les 60 s si un backup planifié est dû. */
export function startScheduler(): void {
  if (timer) return
  timer = setInterval(tick, 60_000)
  // Premier passage rapide après le démarrage.
  setTimeout(tick, 10_000)

  // Autodestruction des liens de partage temporaires (1h) : vérif fréquente
  // pour que l'expiration soit effective peu après l'échéance, y compris
  // pour les liens périmés pendant que l'app était fermée.
  shareTimer = setInterval(shareTick, 30_000)
  setTimeout(shareTick, 5_000)
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  if (shareTimer) {
    clearInterval(shareTimer)
    shareTimer = null
  }
}

async function shareTick(): Promise<void> {
  await revokeExpiredShares().catch(() => null)
}

async function tick(): Promise<void> {
  tickCount++
  if (tickCount % TOKEN_REFRESH_EVERY_N_TICKS === 0) {
    refreshAllAccountTokens().catch(() => null)
  }

  if (isBackupRunning()) return
  const due = getDueSchedules()
  for (const sched of due) {
    const src = getAccount(sched.sourceAccountId)
    const tgt = getAccount(sched.targetAccountId)
    if (!src || !tgt) {
      // Compte supprimé : on désactive la planification.
      updateSchedule(sched.id, { enabled: false })
      continue
    }

    try {
      const report = await runScheduledBackup(
        sched.sourceAccountId,
        sched.targetAccountId,
        sched.mode
      )
      addLog({
        action: 'backup',
        accountId: sched.targetAccountId,
        status: report.failed > 0 ? 'failed' : 'success',
        label: `planifié : ${src.email} → ${tgt.email} (${report.copied} copié·s)`
      })

      // Le résumé (copied/failed/durationMs) est déjà calculé par
      // runScheduledBackup mais n'était jusqu'ici visible que 4s via un
      // toast — invisible si l'app tourne cachée en tray. On ajoute une
      // notification OS (fonctionne sans fenêtre visible) et on conserve le
      // détail des erreurs (autrement perdu) dans les logs.
      if (report.copied > 0 || report.failed > 0) {
        notifyRunComplete(report.copied, report.failed, report.durationMs)
      }
      if (report.errors.length > 0) {
        const truncated = report.errors.length > 20
        const errorDetails = JSON.stringify(
          truncated
            ? [...report.errors.slice(0, 20), { file: '…', reason: `+${report.errors.length - 20} autre(s) erreur(s) non affichée(s)` }]
            : report.errors
        )
        addLog({
          action: 'backup',
          accountId: sched.targetAccountId,
          status: 'failed',
          label: `planifié : détail des erreurs (${report.errors.length}) : ${src.email} → ${tgt.email}`,
          errorDetails
        })
      }
    } catch (err) {
      addLog({
        action: 'backup',
        accountId: sched.targetAccountId,
        status: 'failed',
        label: `planifié : ${src.email} → ${tgt.email}`,
        errorDetails: err instanceof Error ? err.message : String(err)
      })
    } finally {
      updateSchedule(sched.id, {
        lastRun: Date.now(),
        nextRun: computeNextRun(sched.frequency, sched.time)
      })
    }
  }
}

/**
 * Notification OS après un backup planifié : seul moyen fiable de prévenir
 * l'utilisateur quand l'app tourne cachée en tray, sans fenêtre visible pour
 * afficher un toast.
 */
function notifyRunComplete(copied: number, failed: number, durationMs: number): void {
  if (!Notification.isSupported()) return
  const body =
    `${copied} fichier(s) copié(s)` +
    (failed > 0 ? `, ${failed} échec(s)` : '') +
    ` — ${(durationMs / 1000).toFixed(0)}s`
  new Notification({ title: 'Backup planifié terminé', body }).show()
}
