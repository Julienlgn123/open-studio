import { shell } from 'electron'
import type { BloatApp } from '@shared/types'
import { OS, powershellJson, psq } from './platform/exec'
import { logActivity } from './store'

/** Apps préinstallées par Windows, toutes réinstallables depuis le Microsoft Store. */
const CATALOG: { pkg: string; name: string; description: string; storeId?: string }[] = [
  { pkg: 'Microsoft.BingNews', name: 'Actualités (MSN)', description: 'Fil d’actualités Microsoft.', storeId: '9WZDNCRFHVFW' },
  { pkg: 'Microsoft.BingWeather', name: 'Météo (MSN)', description: 'App Météo de Microsoft.', storeId: '9WZDNCRFJ3Q2' },
  { pkg: 'Microsoft.BingSearch', name: 'Recherche Bing', description: 'Raccourci de recherche Bing.' },
  { pkg: 'Microsoft.GetHelp', name: 'Obtenir de l’aide', description: 'Assistance Microsoft en ligne.', storeId: '9PKDZBMV1H3T' },
  { pkg: 'Microsoft.Getstarted', name: 'Astuces', description: 'Conseils pour découvrir Windows.' },
  { pkg: 'Microsoft.MicrosoftSolitaireCollection', name: 'Solitaire Collection', description: 'Jeux de cartes avec pubs.', storeId: '9WZDNCRFHWD2' },
  { pkg: 'Microsoft.WindowsFeedbackHub', name: 'Hub de commentaires', description: 'Envoi d’avis à Microsoft.', storeId: '9NBLGGH4R32N' },
  { pkg: 'Microsoft.People', name: 'Contacts', description: 'Ancienne app Contacts.' },
  { pkg: 'Microsoft.WindowsMaps', name: 'Cartes', description: 'App Cartes (remplacée par le web).', storeId: '9WZDNCRDTBVB' },
  { pkg: 'Microsoft.MicrosoftOfficeHub', name: 'Microsoft 365 (Office)', description: 'Lanceur d’Office qui pousse l’abonnement.', storeId: '9WZDNCRD29V9' },
  { pkg: 'Microsoft.Todos', name: 'Microsoft To Do', description: 'Listes de tâches.', storeId: '9NBLGGH5R558' },
  { pkg: 'Microsoft.PowerAutomateDesktop', name: 'Power Automate', description: 'Automatisation pour entreprises.', storeId: '9NFTCH6J7FHV' },
  { pkg: 'Clipchamp.Clipchamp', name: 'Clipchamp', description: 'Montage vidéo en ligne (compte requis).', storeId: '9P1J8S7CCWWT' },
  { pkg: 'MicrosoftTeams', name: 'Teams (personnel)', description: 'Version grand public de Teams.' },
  { pkg: 'MSTeams', name: 'Teams', description: 'Nouvelle app Teams.', storeId: 'XP8BT8DW290MPQ' },
  { pkg: 'Microsoft.OutlookForWindows', name: 'Outlook (nouveau)', description: 'Nouveau client mail qui remplace Courrier.', storeId: '9NRX63209R7B' },
  { pkg: 'Microsoft.549981C3F5F10', name: 'Cortana', description: 'Ancien assistant vocal.' },
  { pkg: 'Microsoft.Copilot', name: 'Copilot', description: 'Assistant IA de Microsoft.', storeId: '9NHT9RB2F4HD' },
  { pkg: 'Microsoft.MixedReality.Portal', name: 'Portail de réalité mixte', description: 'Casques Windows Mixed Reality (abandonnés).' },
  { pkg: 'Microsoft.ZuneVideo', name: 'Films et TV', description: 'Ancien lecteur vidéo.', storeId: '9WZDNCRFJ3P2' },
  { pkg: 'Microsoft.YourPhone', name: 'Mobile connecté', description: 'Lien avec ton téléphone (à garder si tu l’utilises).', storeId: '9NMPJ99VJBWV' },
  { pkg: 'Microsoft.Windows.DevHome', name: 'Dev Home', description: 'Tableau de bord pour développeurs (abandonné).' },
  { pkg: 'Microsoft.WindowsCommunicationsApps', name: 'Courrier et Calendrier', description: 'Anciennes apps remplacées par Outlook.' },
  { pkg: 'king.com.CandyCrushSaga', name: 'Candy Crush Saga', description: 'Jeu installé d’office.' },
  { pkg: 'SpotifyAB.SpotifyMusic', name: 'Spotify (Store)', description: 'Version Store de Spotify installée d’office.' }
]

export async function listBloat(): Promise<BloatApp[]> {
  if (OS !== 'windows') return []
  const names = await powershellJson<string[] | string>(
    `ConvertTo-Json -InputObject @(Get-AppxPackage | Select-Object -ExpandProperty Name) -Compress`,
    60_000
  ).catch(() => [] as string[])
  const installed = new Set(Array.isArray(names) ? names : [names])
  return CATALOG.map((c) => ({ id: c.pkg, name: c.name, description: c.description, packageName: c.pkg, installed: installed.has(c.pkg) }))
}

export async function removeBloat(ids: string[]): Promise<{ removed: string[]; failed: { id: string; error: string }[] }> {
  const wanted = CATALOG.filter((c) => ids.includes(c.pkg))
  if (!wanted.length) return { removed: [], failed: [] }
  const res = await powershellJson<{ id: string; error: string | null }[] | { id: string; error: string | null }>(
    `
$ErrorActionPreference = 'Continue'
$out = @()
foreach ($n in @(${wanted.map((w) => psq(w.pkg)).join(', ')})) {
  $err = $null
  try { Get-AppxPackage -Name $n | Remove-AppxPackage -ErrorAction Stop } catch { $err = $_.ToString() }
  $out += @{ id = $n; error = $err }
}
ConvertTo-Json -InputObject @($out) -Compress
`,
    5 * 60_000
  )
  const list = Array.isArray(res) ? res : [res]
  const removed = list.filter((r) => !r.error).map((r) => r.id)
  if (removed.length) logActivity(`${removed.length} app(s) préinstallée(s) désinstallée(s)`, 'app')
  return { removed, failed: list.filter((r) => r.error).map((r) => ({ id: r.id, error: r.error! })) }
}

/** Ouvre la page Microsoft Store de l'app pour la réinstaller. */
export function reinstallBloat(id: string): boolean {
  const entry = CATALOG.find((c) => c.pkg === id)
  const url = entry?.storeId ? `ms-windows-store://pdp/?ProductId=${entry.storeId}` : `ms-windows-store://search/?query=${encodeURIComponent(entry?.name ?? id)}`
  void shell.openExternal(url)
  return true
}
