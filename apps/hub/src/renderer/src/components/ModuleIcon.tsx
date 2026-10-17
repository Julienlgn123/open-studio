import type { ModuleInfo } from '@shared/types'

/** Logo d'un module (ou son initiale sur sa couleur, tant que le logo est inconnu). */
export default function ModuleIcon({ module, size = 40 }: { module: ModuleInfo; size?: number }): JSX.Element {
  return (
    <div
      className="module-icon"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.26), ['--accent-m' as string]: module.accent }}
    >
      {module.icon ? <img src={module.icon} alt="" draggable={false} /> : <span style={{ fontSize: size * 0.42 }}>{module.name[0]}</span>}
    </div>
  )
}
