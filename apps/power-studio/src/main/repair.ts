import type { RepairResult, RepairTool } from '@shared/types'
import { AdminDeniedError, OS, powershell, powershellElevated, run, shellElevated } from './platform/exec'
import { logActivity } from './store'

interface Def extends RepairTool {
  os: ('windows' | 'mac' | 'linux')[]
  /** Script PowerShell (Windows) ou commande sh (Mac/Linux). */
  script: string
}

// Outils de dépannage courants. Chacun est une commande standard du système, lancée à la demande,
// jamais en automatique.
const TOOLS: Def[] = [
  {
    id: 'dns',
    os: ['windows'],
    title: 'Vider le cache DNS',
    description: 'Oublie les adresses de sites mémorisées.',
    when: 'Un site ne s’ouvre plus alors qu’il marche ailleurs, ou après un changement de box.',
    admin: false,
    duration: '1 s',
    restart: false,
    script: 'ipconfig /flushdns'
  },
  {
    id: 'dns',
    os: ['mac'],
    title: 'Vider le cache DNS',
    description: 'Oublie les adresses de sites mémorisées.',
    when: 'Un site ne s’ouvre plus alors qu’il marche ailleurs.',
    admin: true,
    duration: '1 s',
    restart: false,
    script: 'dscacheutil -flushcache; killall -HUP mDNSResponder; echo OK'
  },
  {
    id: 'dns',
    os: ['linux'],
    title: 'Vider le cache DNS',
    description: 'Oublie les adresses de sites mémorisées (systemd-resolved).',
    when: 'Un site ne s’ouvre plus alors qu’il marche ailleurs.',
    admin: true,
    duration: '1 s',
    restart: false,
    script: 'resolvectl flush-caches && echo OK'
  },
  {
    id: 'explorer',
    os: ['windows'],
    title: 'Redémarrer l’Explorateur',
    description: 'Relance la barre des tâches, le menu Démarrer et les fenêtres de dossiers.',
    when: 'Barre des tâches figée, menu Démarrer qui ne s’ouvre plus, icônes bloquées.',
    admin: false,
    duration: '5 s',
    restart: false,
    script: "Stop-Process -Name explorer -Force; Start-Sleep -Seconds 2; if (-not (Get-Process explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe }; 'Explorateur relancé.'"
  },
  {
    id: 'icons',
    os: ['windows'],
    title: 'Reconstruire le cache des icônes',
    description: 'Supprime le cache des icônes et des miniatures ; Windows le recrée.',
    when: 'Icônes blanches, mauvaises icônes ou miniatures qui ne s’affichent plus.',
    admin: false,
    duration: '10 s',
    restart: false,
    script: `$ErrorActionPreference = 'SilentlyContinue'
Stop-Process -Name explorer -Force
Start-Sleep -Seconds 1
$dir = Join-Path $env:LOCALAPPDATA 'Microsoft\\Windows\\Explorer'
$n = (Get-ChildItem $dir -Filter 'iconcache*' -Force).Count + (Get-ChildItem $dir -Filter 'thumbcache*' -Force).Count
Remove-Item (Join-Path $dir 'iconcache*') -Force
Remove-Item (Join-Path $dir 'thumbcache*') -Force
Remove-Item (Join-Path $env:LOCALAPPDATA 'IconCache.db') -Force
Start-Sleep -Seconds 1
if (-not (Get-Process explorer)) { Start-Process explorer.exe }
"$n fichiers de cache supprimés, Explorateur relancé."`
  },
  {
    id: 'disks',
    os: ['windows'],
    title: 'État de santé des disques',
    description: 'Demande à chaque disque s’il signale un problème (S.M.A.R.T.).',
    when: 'PC qui rame d’un coup, fichiers corrompus, bruits de disque.',
    admin: false,
    duration: '3 s',
    restart: false,
    script: `Get-PhysicalDisk | ForEach-Object {
  $s = switch ($_.HealthStatus) { 'Healthy' { 'bon état' } 'Warning' { 'ATTENTION : signes d’usure, sauvegarde tes fichiers' } 'Unhealthy' { 'DÉFAILLANT : sauvegarde immédiatement' } default { $_.HealthStatus } }
  "{0} ({1}, {2:N0} Go) : {3}" -f $_.FriendlyName, $_.MediaType, ($_.Size / 1GB), $s
}`
  },
  {
    id: 'sfc',
    os: ['windows'],
    title: 'Vérifier les fichiers de Windows (SFC)',
    description: 'Contrôle les fichiers système et répare ceux qui sont abîmés.',
    when: 'Plantages, écrans bleus, fonctions de Windows qui ne marchent plus.',
    admin: true,
    duration: '5 à 20 min',
    restart: false,
    script: 'sfc /scannow'
  },
  {
    id: 'dism',
    os: ['windows'],
    title: 'Réparer l’image de Windows (DISM)',
    description: 'Retélécharge les composants de Windows abîmés depuis Windows Update.',
    when: 'Quand SFC dit qu’il n’a pas pu tout réparer. Relance SFC après.',
    admin: true,
    duration: '10 à 30 min',
    restart: false,
    script: 'DISM /Online /Cleanup-Image /RestoreHealth'
  },
  {
    id: 'network',
    os: ['windows'],
    title: 'Réinitialiser le réseau',
    description: 'Remet à zéro Winsock et la pile TCP/IP, puis redemande une adresse.',
    when: 'Connecté au Wi-Fi mais « Pas d’Internet », après un VPN ou un logiciel réseau mal désinstallé.',
    admin: true,
    duration: '20 s',
    restart: true,
    script: 'netsh winsock reset; netsh int ip reset; ipconfig /release; ipconfig /renew; ipconfig /flushdns'
  },
  {
    id: 'wupdate',
    os: ['windows'],
    title: 'Débloquer Windows Update',
    description: 'Arrête Windows Update, met de côté son cache de téléchargements et le relance.',
    when: 'Mise à jour bloquée à X %, erreurs à répétition dans Windows Update.',
    admin: true,
    duration: '30 s',
    restart: false,
    script: `Stop-Service wuauserv, bits, cryptsvc -Force -ErrorAction SilentlyContinue
$sd = Join-Path $env:SystemRoot 'SoftwareDistribution'
$bak = "$sd.old-" + (Get-Date -Format 'yyyyMMdd-HHmmss')
if (Test-Path $sd) { Rename-Item $sd $bak -ErrorAction SilentlyContinue }
Start-Service cryptsvc, bits, wuauserv -ErrorAction SilentlyContinue
"Cache mis de côté dans $bak (tu peux le supprimer plus tard). Relance la recherche de mises à jour."`
  },
  {
    id: 'spooler',
    os: ['windows'],
    title: 'Débloquer l’impression',
    description: 'Vide la file d’attente d’impression et redémarre le service.',
    when: 'Document coincé dans la file, imprimante « en erreur » qui n’imprime plus rien.',
    admin: true,
    duration: '5 s',
    restart: false,
    script: `Stop-Service spooler -Force
Remove-Item (Join-Path $env:SystemRoot 'System32\\spool\\PRINTERS\\*') -Force -ErrorAction SilentlyContinue
Start-Service spooler
'File d’impression vidée, service relancé.'`
  },
  {
    id: 'time',
    os: ['windows'],
    title: 'Remettre l’heure à l’heure',
    description: 'Resynchronise l’horloge avec les serveurs de temps de Windows.',
    when: 'Heure fausse, erreurs de certificat sur les sites (« votre horloge est en avance »).',
    admin: true,
    duration: '5 s',
    restart: false,
    script: 'Start-Service w32time -ErrorAction SilentlyContinue; w32tm /resync /force'
  }
]

export function listRepairTools(): RepairTool[] {
  return TOOLS.filter((t) => t.os.includes(OS)).map(({ os: _os, script: _s, ...t }) => t)
}

const clean = (s: string): string => s.replace(/\u0000/g, '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim()

export async function runRepair(id: string): Promise<RepairResult> {
  const t = TOOLS.find((x) => x.id === id && x.os.includes(OS))
  if (!t) return { ok: false, output: 'Outil inconnu.', adminDenied: false }
  try {
    let out: string
    if (OS === 'windows') {
      if (t.admin) out = await powershellElevated(`try { & { ${t.script} } *>&1 | Out-String -Width 200 | Set-Content -LiteralPath $OutFile -Encoding UTF8 } catch { $_ | Out-String | Set-Content -LiteralPath $OutFile -Encoding UTF8 }`, 45 * 60_000)
      else {
        const r = await powershell(t.script, 5 * 60_000)
        out = r.stdout + (r.code ? `\n${r.stderr}` : '')
      }
    } else if (t.admin) out = (await shellElevated(t.script)).stdout
    else out = (await run('sh', ['-c', t.script])).stdout
    logActivity(`Dépannage : ${t.title}`, 'tweak')
    return { ok: true, output: clean(out) || 'Terminé.', adminDenied: false }
  } catch (err) {
    if (err instanceof AdminDeniedError) return { ok: false, output: '', adminDenied: true }
    return { ok: false, output: err instanceof Error ? err.message : String(err), adminDenied: false }
  }
}
