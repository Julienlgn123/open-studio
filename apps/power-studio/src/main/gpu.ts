import { nvidiaSmi } from './hardware'
import { OS, powershellElevated, psq, shellElevated } from './platform/exec'

/**
 * Limite de puissance du GPU NVIDIA (watts). `nvidia-smi -pl` demande les droits admin :
 * une fenêtre de confirmation (UAC / mot de passe) s'affiche à chaque changement, et
 * seulement quand l'utilisateur applique lui-même un profil. La limite revient à la
 * valeur d'usine au redémarrage du PC.
 */
export async function setGpuPowerLimit(watts: number): Promise<void> {
  const w = Math.round(watts)
  const smi = await nvidiaSmi()
  if (!smi) throw new Error('nvidia-smi introuvable : le pilote NVIDIA est-il installé ?')
  if (OS === 'windows') {
    const out = await powershellElevated(`
$r = & ${psq(smi)} -pl ${w} 2>&1 | Out-String
Set-Content -LiteralPath $OutFile -Value ("code=" + $LASTEXITCODE + "\`n" + $r)
`)
    if (!/code=0/.test(out)) throw new Error(out.replace(/code=-?\d+/, '').trim() || 'nvidia-smi a échoué')
    return
  }
  if (OS === 'linux') {
    const res = await shellElevated(`${smi} -pl ${w}`)
    if (res.code !== 0) throw new Error(res.stderr.trim() || res.stdout.trim() || 'nvidia-smi a échoué')
    return
  }
  throw new Error('Non disponible sur ce système')
}
