import { spawn } from 'child_process'
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join, basename, dirname } from 'path'
import type { CatalogEntry } from '@shared/types'
import type { PlatformInstaller } from './types'
import { dirSize } from './dirSize'

/**
 * `timeoutMs` évite un blocage infini côté UI (barre de progression qui ne
 * finit jamais) si l'installateur reste coincé en interne — par exemple NSIS
 * qui attend en boucle qu'un fichier verrouillé se libère, sans jamais
 * pouvoir le signaler puisqu'il tourne en mode silencieux (`/S`, aucune
 * fenêtre pour montrer une éventuelle erreur/retry).
 */
function run(cmd: string, args: string[], timeoutMs = 180_000): Promise<void> {
  return new Promise((resolve, reject) => {
    // detached : évite que l'installateur/désinstalleur NSIS (qui se recopie
    // dans un dossier temp et se relance tout seul) reste rattaché à l'arbre
    // de processus/job object d'Open Studio — un tel enfant orphelin peut
    // sinon garder un handle ouvert sur les fichiers bien après la fin
    // apparente de la commande, verrouillant tout le dossier.
    const child = spawn(cmd, args, { windowsHide: true, detached: true })
    const timer = setTimeout(() => {
      child.kill()
      reject(
        new Error(
          `${cmd} ne répond plus après ${Math.round(timeoutMs / 1000)}s — abandon.`
        )
      )
    }, timeoutMs)
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`${cmd} a échoué (code ${code})`))
    })
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Un installateur tout juste écrit sur disque (venant d'être téléchargé,
 * souvent d'une app neuve sans aucune réputation connue de Windows Defender)
 * peut se faire verrouiller/scanner brièvement pile au moment où on l'exécute
 * — NSIS échoue alors immédiatement (code 2) sans que rien ne soit réellement
 * cassé : une seconde tentative quelques instants plus tard passe. Confirmé
 * en reproduisant : le même .exe, invoqué exactement pareil juste après,
 * réussit à chaque fois.
 */
async function runWithRetry(
  cmd: string,
  args: string[],
  targetDir: string,
  attempts = 3,
  delayMs = 1500
): Promise<void> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      await run(cmd, args)
      return
    } catch (err) {
      lastErr = err
      if (i < attempts - 1) {
        await sleep(delayMs)
        // Un abort NSIS peut faire disparaître le dossier cible qu'on avait
        // déjà créé (rollback) — on le recrée avant de retenter /D=.
        mkdirSync(targetDir, { recursive: true })
      }
    }
  }
  throw lastErr
}

/**
 * Un désinstalleur NSIS lancé en `/S` se recopie dans un dossier temporaire
 * et se relance depuis là — le process initial (celui qu'on attend) sort
 * presque tout de suite, pendant que la vraie suppression de fichiers se
 * termine juste après en arrière-plan (parfois plusieurs secondes, un
 * antivirus peut aussi verrouiller brièvement un .exe/.asar fraîchement
 * écrit). On retente longtemps avant d'abandonner — et un échec final n'est
 * pas fatal : l'app est déjà bien désinstallée à ce stade, il ne reste
 * qu'un dossier résiduel qu'on pourra reprendre plus tard.
 */
async function rmDirBestEffort(dir: string, attempts = 20, delayMs = 600): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      rmSync(dir, { recursive: true, force: true })
      return
    } catch {
      if (i === attempts - 1) return
      await sleep(delayMs)
    }
  }
}

export const winInstaller: PlatformInstaller = {
  async detectExisting(entry) {
    // Emplacement par défaut d'un install NSIS fait manuellement par
    // l'utilisateur (Programs\<productName>\<productName>.exe).
    const p = join(
      process.env.LOCALAPPDATA || '',
      'Programs',
      entry.productName,
      `${entry.productName}.exe`
    )
    return existsSync(p) ? p : null
  },

  async install(entry, downloadedPath, managedDir) {
    // Une mise à jour sur une app encore ouverte verrouille son .exe : le
    // silent install échouerait à écraser ce fichier sans le signaler.
    await run('taskkill', ['/IM', `${entry.productName}.exe`, '/F']).catch(() => null)
    // Après le taskkill, Windows (ou un antivirus qui scanne le process qui
    // vient de mourir) peut garder le .exe verrouillé encore un court instant.
    // Sans cette pause, l'installateur silencieux tente d'écraser un fichier
    // encore locké : NSIS boucle alors en interne en attendant que le verrou
    // se libère, sans jamais pouvoir l'afficher (`/S` = aucune fenêtre) — vu
    // d'Open Studio, ça ressemble à un chargement infini.
    await sleep(800)

    // NSIS exige que /D soit le DERNIER argument et ne soit jamais entre
    // guillemets, même si le chemin contient des espaces.
    await runWithRetry(downloadedPath, ['/S', `/D=${managedDir}`], managedDir)
    const exe = join(managedDir, `${entry.productName}.exe`)
    if (!existsSync(exe)) {
      throw new Error(
        "L'installateur s'est terminé mais l'exécutable est introuvable à l'emplacement attendu."
      )
    }
    return exe
  },

  async launch(_entry, execPath) {
    spawn(execPath, [], { detached: true, stdio: 'ignore' }).unref()
  },

  async uninstall(entry, execPath) {
    // Si l'app est encore ouverte, ses fichiers (dont app.asar) sont
    // verrouillés et la suppression échoue — on la ferme d'abord.
    await run('taskkill', ['/IM', basename(execPath), '/F']).catch(() => null)

    const dir = execPath.slice(0, execPath.lastIndexOf('\\'))
    const uninstaller = join(dir, `Uninstall ${entry.productName}.exe`)
    if (existsSync(uninstaller)) {
      await run(uninstaller, ['/S']).catch(() => null)
      // Laisse le temps au désinstalleur (relancé depuis un dossier temp) de
      // terminer son propre nettoyage avant qu'on tente le nôtre.
      await sleep(800)
    }
    // Best-effort : même si un résidu verrouillé traîne, l'app elle-même est
    // bien désinstallée (l'exécutable et son entrée de registre ont disparu).
    await rmDirBestEffort(dir)
  },

  async getInstalledSize(_entry, execPath) {
    // L'exe suivi vit dans le dossier d'install géré par Open Studio (ou
    // détecté sous Programs\<productName>) — sa taille représente donc toute
    // l'app. Un chemin devenu invalide (copie déplacée/supprimée manuellement
    // depuis la dernière détection) ne doit pas faire planter l'appel.
    try {
      return dirSize(dirname(execPath))
    } catch {
      return null
    }
  }
}
