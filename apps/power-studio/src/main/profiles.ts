import type { HardwareProfile, ProfileAction, ProfileApplyResult, ProfileDef, ProfileId } from '@shared/types'
import { setGpuPowerLimit } from './gpu'
import { AdminDeniedError, OS, powershellJson, psq, run, shellElevated } from './platform/exec'
import { getSettings, getStore, logActivity, setSettings, updateStore } from './store'

/** Plans de base de Windows (GUID fixes, identiques sur toutes les installations). */
const BASE_SCHEME: Record<ProfileId, string[]> = {
  // Performances optimales (masqué par défaut, mais duplicable partout), sinon Hautes performances.
  performance: ['e9a42b02-d5df-448d-aa00-03f14749eb61', '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'],
  balanced: ['381b4222-f694-41f0-9685-ff5bb260df2e'],
  silent: ['381b4222-f694-41f0-9685-ff5bb260df2e'],
  eco: ['a1841308-3541-4fab-bc81-f71556f20b4a', '381b4222-f694-41f0-9685-ff5bb260df2e']
}

const SCHEME_NAME: Record<ProfileId, string> = {
  performance: 'Power Studio - Performance max',
  balanced: 'Power Studio - Équilibré',
  silent: 'Power Studio - Silencieux',
  eco: 'Power Studio - Économie max'
}

interface PowerValue {
  sub: string
  setting: string
  ac: number
  dc: number
}

const USB = ['2a737441-1930-4402-8d77-b2bebba308a3', '48e6b7a6-50f5-4782-a5d4-53bb8f07e226']
const WIFI = ['19cbb8fa-5279-450e-9fac-8a3d5fedd0c1', '12bbebe6-58d6-4636-95bb-3217ef867c1a']

interface Plan {
  def: ProfileDef
  /** Réglages powercfg (Windows). */
  power: PowerValue[]
  gpuWatts: number | null
}

const PROFILE_META: Record<ProfileId, { name: string; tagline: string; color: string }> = {
  performance: { name: 'Performance max', tagline: 'Tout à fond : processeur, carte graphique, ventilateurs.', color: '#ef4444' },
  balanced: { name: 'Équilibré', tagline: 'Rapide quand il faut, économe le reste du temps.', color: '#3b82f6' },
  silent: { name: 'Silencieux', tagline: 'Moins de chaleur et de bruit, un peu moins de puissance.', color: '#a855f7' },
  eco: { name: 'Économie max', tagline: 'Consommation minimale, batterie qui dure le plus longtemps.', color: '#22c55e' }
}

function gpuTarget(id: ProfileId, hw: HardwareProfile): { watts: number; gpu: string } | null {
  const gpu = hw.gpus.find((g) => g.powerLimit)
  const pl = gpu?.powerLimit
  if (!gpu || !pl) return null
  const watts =
    id === 'performance'
      ? pl.max
      : id === 'balanced'
        ? pl.default
        : id === 'silent'
          ? Math.max(pl.min, Math.round(pl.default * 0.75))
          : pl.min
  return { watts, gpu: gpu.model }
}

/** Calcule ce que fait chaque profil sur CETTE machine. */
export function buildPlan(id: ProfileId, hw: HardwareProfile): Plan {
  const actions: ProfileAction[] = []
  const power: PowerValue[] = []
  const { laptop } = hw
  const cores = hw.cpu.cores
  const cpu = hw.cpu.brand
  const add = (a: ProfileAction): void => void actions.push(a)
  const set = (sub: string, setting: string, ac: number, dc: number): void => void power.push({ sub, setting, ac, dc })

  if (OS === 'windows') {
    const plan = id === 'performance' ? 'Performances optimales' : id === 'eco' ? 'Économie d’énergie' : 'Utilisation normale'
    add({ id: 'scheme', label: "Plan d'alimentation", value: SCHEME_NAME[id].replace('Power Studio - ', ''), why: `Plan dédié créé à partir de « ${plan} » de Windows : tes plans existants ne sont pas modifiés.`, admin: false })

    if (id === 'performance') {
      set('SUB_PROCESSOR', 'PROCTHROTTLEMIN', 100, 100)
      set('SUB_PROCESSOR', 'PROCTHROTTLEMAX', 100, 100)
      set('SUB_PROCESSOR', 'PERFBOOSTMODE', 2, 2)
      set('SUB_PROCESSOR', 'PERFEPP', 0, 0)
      set('SUB_PROCESSOR', 'CPMINCORES', 100, 100)
      set('SUB_PROCESSOR', 'SYSCOOLPOL', 1, 1)
      set('SUB_DISK', 'DISKIDLE', 0, 0)
      set('SUB_PCIEXPRESS', 'ASPM', 0, 0)
      set(USB[0], USB[1], 0, 0)
      set(WIFI[0], WIFI[1], 0, 0)
      add({ id: 'cpu', label: 'Processeur', value: '100 % en permanence', why: `${cpu} reste à sa fréquence maximale, sans temps de montée.`, admin: false })
      add({ id: 'boost', label: 'Boost', value: 'Agressif', why: 'Le processeur dépasse sa fréquence de base dès qu’il peut (turbo).', admin: false })
      add({ id: 'cores', label: 'Cœurs', value: `${cores} actifs`, why: `Aucun des ${cores} cœurs n’est mis en veille : pas de latence au réveil.`, admin: false })
      add({ id: 'fans', label: 'Refroidissement', value: 'Actif', why: 'Windows accélère les ventilateurs AVANT de ralentir le processeur.', admin: false })
      add({ id: 'devices', label: 'Disques, USB, PCIe, Wi-Fi', value: 'Jamais en veille', why: 'Aucune économie d’énergie sur les périphériques : pas de micro-coupures.', admin: false })
    } else if (id === 'balanced') {
      set('SUB_PROCESSOR', 'PROCTHROTTLEMIN', 5, 5)
      set('SUB_PROCESSOR', 'PROCTHROTTLEMAX', 100, 100)
      set('SUB_PROCESSOR', 'PERFBOOSTMODE', 2, 1)
      set('SUB_PROCESSOR', 'PERFEPP', 25, 50)
      set('SUB_PROCESSOR', 'SYSCOOLPOL', 1, laptop ? 0 : 1)
      add({ id: 'cpu', label: 'Processeur', value: '5 → 100 %', why: `${cpu} ralentit au repos et accélère instantanément à la demande.`, admin: false })
      add({ id: 'boost', label: 'Boost', value: laptop ? 'Agressif secteur, normal batterie' : 'Agressif', why: 'Turbo disponible, le processeur redescend dès que la charge baisse.', admin: false })
      add({ id: 'fans', label: 'Refroidissement', value: laptop ? 'Actif secteur, passif batterie' : 'Actif', why: laptop ? 'Sur batterie, Windows ralentit le processeur avant de faire tourner les ventilateurs.' : 'Les ventilateurs passent en premier pour garder les performances.', admin: false })
    } else if (id === 'silent') {
      set('SUB_PROCESSOR', 'PROCTHROTTLEMIN', 5, 5)
      set('SUB_PROCESSOR', 'PROCTHROTTLEMAX', 99, 90)
      set('SUB_PROCESSOR', 'PERFBOOSTMODE', 0, 0)
      set('SUB_PROCESSOR', 'PERFEPP', 60, 70)
      set('SUB_PROCESSOR', 'SYSCOOLPOL', 0, 0)
      add({ id: 'boost', label: 'Boost', value: 'Désactivé', why: `Sans turbo, ${cpu} chauffe beaucoup moins : c'est la source n°1 de bruit des ventilateurs.`, admin: false })
      add({ id: 'cpu', label: 'Processeur', value: laptop ? '≤ 99 % secteur, ≤ 90 % batterie' : '≤ 99 %', why: 'Plafonner juste sous 100 % coupe le turbo sur la plupart des processeurs.', admin: false })
      add({ id: 'fans', label: 'Refroidissement', value: 'Passif', why: 'Windows ralentit le processeur avant d’accélérer les ventilateurs.', admin: false })
    } else {
      set('SUB_PROCESSOR', 'PROCTHROTTLEMIN', 0, 0)
      set('SUB_PROCESSOR', 'PROCTHROTTLEMAX', laptop ? 80 : 70, laptop ? 50 : 70)
      set('SUB_PROCESSOR', 'PERFBOOSTMODE', 0, 0)
      set('SUB_PROCESSOR', 'PERFEPP', 100, 100)
      set('SUB_PROCESSOR', 'CPMINCORES', 0, 0)
      set('SUB_PROCESSOR', 'SYSCOOLPOL', 0, 0)
      set('SUB_PCIEXPRESS', 'ASPM', 2, 2)
      set(USB[0], USB[1], 1, 1)
      set(WIFI[0], WIFI[1], laptop ? 1 : 0, 3)
      set('SUB_DISK', 'DISKIDLE', 600, 120)
      if (laptop) {
        set('SUB_ENERGYSAVER', 'ESBATTTHRESHOLD', 100, 100)
        set('SUB_VIDEO', 'VIDEOIDLE', 600, 180)
      }
      add({ id: 'cpu', label: 'Processeur', value: laptop ? '≤ 80 % secteur, ≤ 50 % batterie' : '≤ 70 %', why: `${cpu} est plafonné : moins de watts, moins de chaleur.`, admin: false })
      add({ id: 'boost', label: 'Boost', value: 'Désactivé', why: 'Le turbo consomme énormément pour un gain faible en usage courant.', admin: false })
      add({ id: 'cores', label: 'Cœurs', value: 'Mise en veille autorisée', why: `Les cœurs inutilisés (sur ${cores}) s'endorment.`, admin: false })
      add({ id: 'fans', label: 'Refroidissement', value: 'Passif', why: 'Ventilateurs au minimum : le processeur ralentit d’abord.', admin: false })
      add({ id: 'devices', label: 'PCIe, USB, Wi-Fi, disques', value: 'Économie maximale', why: 'Les périphériques inactifs se mettent en veille.', admin: false })
      if (laptop) add({ id: 'saver', label: 'Économiseur de batterie', value: 'Toujours sur batterie', why: 'Windows limite les applis en arrière-plan et baisse la luminosité.', admin: false })
    }
  }

  if (OS === 'mac') {
    const caps = hw.capabilities
    if (id === 'performance') {
      add({ id: 'lowpower', label: 'Mode économie d’énergie', value: 'Désactivé', why: 'Le Mac peut utiliser toute sa puissance.', admin: true })
      if (caps.highPowerMode) add({ id: 'highpower', label: 'Mode haute puissance', value: 'Activé (secteur)', why: 'Ventilateurs plus rapides pour tenir les performances sous charge longue.', admin: true })
    } else if (id === 'balanced') {
      add({ id: 'lowpower', label: 'Mode économie d’énergie', value: 'Désactivé', why: 'Réglage automatique de macOS.', admin: true })
    } else {
      add({ id: 'lowpower', label: 'Mode économie d’énergie', value: id === 'silent' ? 'Activé' : 'Activé partout', why: 'Fréquences réduites : moins de chaleur, ventilateurs discrets, batterie qui dure.', admin: true })
      if (id === 'eco') add({ id: 'sleep', label: 'Veille écran (batterie)', value: '2 min', why: 'L’écran est le plus gros consommateur d’un portable.', admin: true })
    }
    if (!caps.lowPowerMode) actions.forEach((a) => (a.unavailable = 'Nécessite macOS 12 ou plus récent'))
  }

  if (OS === 'linux') {
    const ppd = hw.capabilities.powerProfilesDaemon
    const target = id === 'performance' ? 'performance' : id === 'eco' ? 'power-saver' : 'balanced'
    add({ id: 'ppd', label: 'Profil système', value: target, why: ppd ? 'Profil de power-profiles-daemon (le même que dans les réglages du bureau).' : 'Gouverneur du processeur (cpufreq).', admin: !ppd, unavailable: ppd || hw.capabilities.cpuLimit ? undefined : 'Ni power-profiles-daemon ni cpufreq disponibles' })
    add({ id: 'boost', label: 'Boost', value: id === 'silent' || id === 'eco' ? 'Désactivé' : 'Activé', why: 'Le turbo est la plus grosse source de chaleur et de consommation.', admin: true })
  }

  const gpu = gpuTarget(id, hw)
  const gpuTuning = getSettings().gpuTuning
  let gpuWatts: number | null = null
  if (gpu && OS !== 'mac') {
    const pl = hw.gpus.find((g) => g.powerLimit)!.powerLimit!
    gpuWatts = gpuTuning ? gpu.watts : null
    add({
      id: 'gpu',
      label: `Carte graphique (${gpu.gpu.replace(/^NVIDIA\s+/i, '')})`,
      value: `${gpu.watts} W`,
      why:
        id === 'performance'
          ? `Limite poussée au maximum autorisé par NVIDIA (${pl.max} W au lieu de ${pl.default} W).`
          : id === 'balanced'
            ? `Limite d'usine (${pl.default} W).`
            : `Limite réduite (plage ${pl.min}–${pl.max} W) : moins de chaleur et de bruit.`,
      admin: true,
      unavailable: gpuTuning ? undefined : 'Désactivé dans les réglages (demande les droits admin à chaque changement)'
    })
  }

  if (OS === 'windows') {
    const fanTool = hw.vendorTools.find((t) => t.fans)
    add({
      id: 'fan-curves',
      label: 'Courbes des ventilateurs',
      value: fanTool ? `Via ${fanTool.name}` : 'Logiciel du fabricant',
      why: fanTool
        ? `Windows ne pilote pas directement les ventilateurs : ${fanTool.name} (détecté) le fait. Power Studio règle la politique de refroidissement.`
        : 'Windows ne pilote pas directement les ventilateurs : utilise le BIOS ou le logiciel de ta carte mère pour des courbes précises.',
      admin: false,
      unavailable: 'Réglage manuel'
    })
  }

  return { def: { id, ...PROFILE_META[id], actions }, power, gpuWatts }
}

export function describeProfiles(hw: HardwareProfile): ProfileDef[] {
  return (['performance', 'balanced', 'silent', 'eco'] as ProfileId[]).map((id) => buildPlan(id, hw).def)
}

// ─── Windows ────────────────────────────────────────────────────────────────

async function activeSchemeWin(): Promise<string | null> {
  const res = await run('powercfg.exe', ['/getactivescheme'], { timeoutMs: 8000 })
  return res.stdout.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]?.toLowerCase() ?? null
}

async function listSchemesWin(): Promise<string[]> {
  const res = await run('powercfg.exe', ['/list'], { timeoutMs: 8000 })
  return [...res.stdout.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)].map((m) => m[0].toLowerCase())
}

async function applyWindows(id: ProfileId, plan: Plan): Promise<{ applied: string[]; failed: { id: string; error: string }[] }> {
  const store = getStore()
  const active = await activeSchemeWin()
  const ours = new Set(Object.values(store.powerSchemes))
  if (!store.originalScheme && active && !ours.has(active)) updateStore((d) => (d.originalScheme = active))

  const existing = await listSchemesWin()
  let guid = store.powerSchemes[id]
  if (!guid || !existing.includes(guid)) guid = ''

  // Un seul script : création du plan si besoin, tous les réglages, activation.
  const values = plan.power.map((v) => `@(${psq(v.sub)}, ${psq(v.setting)}, ${v.ac}, ${v.dc})`).join(',\n  ')
  const script = `
$ErrorActionPreference = 'Continue'
$guid = ${psq(guid)}
if (-not $guid) {
  foreach ($base in @(${BASE_SCHEME[id].map(psq).join(', ')})) {
    $out = powercfg /duplicatescheme $base 2>&1 | Out-String
    $m = [regex]::Match($out, '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}')
    if ($m.Success) { $guid = $m.Value.ToLower(); break }
  }
  if (-not $guid) { @{ error = "Impossible de créer le plan d'alimentation" } | ConvertTo-Json -Compress; exit 0 }
  powercfg /changename $guid ${psq(SCHEME_NAME[id])} ${psq('Créé par Power Studio')} | Out-Null
}
$failed = @()
$values = @(
  ${values || '$null'}
)
foreach ($v in $values) {
  if (-not $v) { continue }
  powercfg /setacvalueindex $guid $v[0] $v[1] $v[2] 2>&1 | Out-Null
  $a = $LASTEXITCODE
  powercfg /setdcvalueindex $guid $v[0] $v[1] $v[3] 2>&1 | Out-Null
  if ($a -ne 0 -or $LASTEXITCODE -ne 0) { $failed += $v[1] }
}
powercfg /setactive $guid 2>&1 | Out-Null
$ok = $LASTEXITCODE -eq 0
@{ guid = $guid; failed = $failed; active = $ok } | ConvertTo-Json -Compress
`
  const res = await powershellJson<{ guid?: string; failed?: string[] | string; active?: boolean; error?: string }>(script, 60_000)
  if (res.error || !res.guid) throw new Error(res.error ?? 'Échec du plan d’alimentation')
  updateStore((d) => (d.powerSchemes[id] = res.guid!))
  if (!res.active) throw new Error("Le plan n'a pas pu être activé")
  const failedSettings = Array.isArray(res.failed) ? res.failed : res.failed ? [res.failed] : []
  // Réglages absents sur certains processeurs (ex. PERFEPP) : on ne l'affiche pas comme une erreur.
  const optional = new Set(['PERFEPP', 'CPMINCORES', 'ESBATTTHRESHOLD', WIFI[1], USB[1]])
  return {
    applied: plan.def.actions.filter((a) => !a.unavailable && a.id !== 'gpu').map((a) => a.id),
    failed: failedSettings.filter((s) => !optional.has(s)).map((s) => ({ id: s, error: 'Réglage refusé par Windows' }))
  }
}

// ─── macOS ─────────────────────────────────────────────────────────────────

async function applyMac(id: ProfileId, hw: HardwareProfile): Promise<void> {
  const cap = (await run('pmset', ['-g', 'cap'], { timeoutMs: 5000 })).stdout
  const modern = /\bpowermode\b/.test(cap)
  const cmds: string[] = []
  if (modern) {
    // powermode : 0 automatique, 1 économie, 2 haute puissance.
    if (id === 'performance') cmds.push(`pmset -b powermode 0`, `pmset -c powermode ${hw.capabilities.highPowerMode ? 2 : 0}`)
    else if (id === 'balanced') cmds.push('pmset -a powermode 0')
    else cmds.push('pmset -a powermode 1')
  } else {
    cmds.push(`pmset -a lowpowermode ${id === 'silent' || id === 'eco' ? 1 : 0}`)
  }
  if (id === 'eco') cmds.push('pmset -b displaysleep 2')
  else cmds.push('pmset -b displaysleep 5')
  const res = await shellElevated(cmds.join(' && '))
  if (res.code !== 0) throw new Error(res.stderr.trim() || 'pmset a échoué')
}

// ─── Linux ─────────────────────────────────────────────────────────────────

async function applyLinux(id: ProfileId, hw: HardwareProfile): Promise<void> {
  const boost = id === 'performance' || id === 'balanced'
  const target = id === 'performance' ? 'performance' : id === 'eco' ? 'power-saver' : 'balanced'
  if (hw.capabilities.powerProfilesDaemon) {
    const res = await run('powerprofilesctl', ['set', target], { timeoutMs: 10_000 })
    if (res.code !== 0) throw new Error(res.stderr.trim() || 'powerprofilesctl a échoué')
  }
  const root: string[] = []
  if (!hw.capabilities.powerProfilesDaemon && hw.capabilities.cpuLimit) {
    root.push(`for g in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do echo ${id === 'performance' ? 'performance' : 'powersave'} > "$g"; done`)
  }
  root.push(
    `[ -w /sys/devices/system/cpu/intel_pstate/no_turbo ] && echo ${boost ? 0 : 1} > /sys/devices/system/cpu/intel_pstate/no_turbo`,
    `[ -w /sys/devices/system/cpu/cpufreq/boost ] && echo ${boost ? 1 : 0} > /sys/devices/system/cpu/cpufreq/boost`,
    'true'
  )
  const res = await shellElevated(root.join('; '))
  if (res.code !== 0) throw new Error(res.stderr.trim() || 'Réglage du processeur refusé')
}

/**
 * Applique un profil. `manual` : l'utilisateur a cliqué (la limite GPU, qui demande
 * les droits admin, n'est appliquée que dans ce cas — jamais par les règles automatiques).
 */
export async function applyProfile(id: ProfileId, hw: HardwareProfile, manual: boolean): Promise<ProfileApplyResult> {
  const plan = buildPlan(id, hw)
  const result: ProfileApplyResult = { profile: id, ok: true, applied: [], failed: [], adminDenied: false }
  try {
    if (OS === 'windows') {
      const r = await applyWindows(id, plan)
      result.applied.push(...r.applied)
      result.failed.push(...r.failed)
    } else if (OS === 'mac') {
      await applyMac(id, hw)
      result.applied.push(...plan.def.actions.filter((a) => !a.unavailable).map((a) => a.id))
    } else {
      await applyLinux(id, hw)
      result.applied.push('ppd', 'boost')
    }
  } catch (err) {
    if (err instanceof AdminDeniedError) result.adminDenied = true
    result.ok = false
    result.failed.push({ id: 'profile', error: err instanceof Error ? err.message : String(err) })
  }

  if (result.ok && manual && plan.gpuWatts !== null) {
    try {
      const pl = hw.gpus.find((g) => g.powerLimit)?.powerLimit
      if (pl && getStore().originalGpuLimit === null) updateStore((d) => (d.originalGpuLimit = pl.default))
      await setGpuPowerLimit(plan.gpuWatts)
      result.applied.push('gpu')
    } catch (err) {
      if (err instanceof AdminDeniedError) result.adminDenied = true
      result.failed.push({ id: 'gpu', error: err instanceof Error ? err.message : String(err) })
    }
  }

  if (result.ok) {
    setSettings({ activeProfile: id })
    logActivity(`Profil « ${PROFILE_META[id].name} » appliqué${manual ? '' : ' automatiquement'}`, 'profile')
  } else {
    logActivity(`Échec du profil « ${PROFILE_META[id].name} » : ${result.failed[0]?.error ?? ''}`, 'error')
  }
  return result
}

export function profileName(id: ProfileId): string {
  return PROFILE_META[id].name
}

/** Remet le plan d'alimentation d'origine et supprime les plans créés par l'app. */
export async function restoreDefaults(hw: HardwareProfile, includeGpu: boolean): Promise<void> {
  const store = getStore()
  if (OS === 'windows') {
    const original = store.originalScheme ?? '381b4222-f694-41f0-9685-ff5bb260df2e'
    const existing = await listSchemesWin()
    const target = existing.includes(original) ? original : '381b4222-f694-41f0-9685-ff5bb260df2e'
    await run('powercfg.exe', ['/setactive', target], { timeoutMs: 8000 })
    for (const guid of Object.values(store.powerSchemes)) {
      if (existing.includes(guid) && guid !== target) await run('powercfg.exe', ['/delete', guid], { timeoutMs: 8000 })
    }
    updateStore((d) => {
      d.powerSchemes = {}
      d.originalScheme = null
    })
  } else if (OS === 'mac') {
    await applyMac('balanced', hw)
  } else {
    await applyLinux('balanced', hw)
  }
  const pl = hw.gpus.find((g) => g.powerLimit)?.powerLimit
  if (includeGpu && pl && pl.current !== pl.default) {
    await setGpuPowerLimit(pl.default)
    updateStore((d) => (d.originalGpuLimit = null))
  }
  setSettings({ activeProfile: null })
  logActivity("Réglages d'alimentation d'origine rétablis", 'profile')
}

/** Profil actif selon le système (Windows : plan actif créé par l'app). */
export async function detectActiveProfile(): Promise<ProfileId | null> {
  if (OS !== 'windows') return getSettings().activeProfile
  const active = await activeSchemeWin()
  const entry = Object.entries(getStore().powerSchemes).find(([, g]) => g === active)
  return (entry?.[0] as ProfileId | undefined) ?? null
}
