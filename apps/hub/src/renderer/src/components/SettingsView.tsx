import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import type { ThemeSetting } from '@shared/types'
import { useStore } from '../store'
import Brandmark from './Brandmark'

const MOD = /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl+'
const GLOBAL = /Mac/i.test(navigator.platform) ? '⌘⌥Espace' : 'Ctrl+Alt+Espace'

const THEMES: { id: ThemeSetting; label: string; icon: JSX.Element }[] = [
  { id: 'dark', label: 'Sombre', icon: <Moon size={14} /> },
  { id: 'light', label: 'Clair', icon: <Sun size={14} /> },
  { id: 'system', label: 'Système', icon: <Monitor size={14} /> }
]

export default function SettingsView(): JSX.Element {
  const { settings, setTheme, setLaunchAtStartup, catalog, openTour } = useStore()
  const [version, setVersion] = useState('')
  useEffect(() => {
    window.api.app.getVersion().then(setVersion).catch(() => {})
  }, [])

  return (
    <div className="page">
      <div className="page-inner narrow">
        <div className="page-head">
          <div>
            <h1 className="page-title">Réglages</h1>
            <div className="page-sub">S’appliquent à Open Studio et à tous ses modules.</div>
          </div>
        </div>

        <section className="panel">
          <div className="setting">
            <div>
              <div className="setting-name">Apparence</div>
              <div className="setting-desc">Le même thème partout, modules compris.</div>
            </div>
            <div className="segmented">
              {THEMES.map((t) => (
                <button key={t.id} className={settings.theme === t.id ? 'on' : ''} onClick={() => void setTheme(t.id)}>
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="setting">
            <div>
              <div className="setting-name">Lancer avec l’ordinateur</div>
              <div className="setting-desc">Open Studio démarre discrètement près de l’horloge : sauvegardes planifiées et rappels continuent sans ouvrir la fenêtre.</div>
            </div>
            <button
              className={`switch${settings.launchAtStartup ? ' on' : ''}`}
              role="switch"
              aria-checked={settings.launchAtStartup}
              onClick={() => void setLaunchAtStartup(!settings.launchAtStartup)}
            >
              <span />
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="setting-head">
            <div className="setting-name">Raccourcis</div>
            <button className="btn btn-ghost btn-sm" onClick={openTour}>
              Revoir la visite guidée
            </button>
          </div>
          <div className="shortcuts">
            <span>Aller à un module, aux réglages…</span>
            <kbd>{MOD}K</kbd>
            <span>Ouvrir Open Studio de n’importe où</span>
            <kbd>{GLOBAL}</kbd>
            <span>Module 1 à 9 de la barre de gauche</span>
            <kbd>{MOD}1 … {MOD}9</kbd>
            <span>Accueil</span>
            <kbd>{MOD}0</kbd>
          </div>
        </section>

        <section className="panel about">
          <Brandmark size={34} />
          <div>
            <div className="setting-name">Open Studio {version && `v${version}`}</div>
            <div className="setting-desc">
              Se met à jour tout seul, modules compris. Tout reste sur ton ordinateur.
              {catalog && catalog.source !== 'GitHub' && <> Modules de test : {catalog.source}</>}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
