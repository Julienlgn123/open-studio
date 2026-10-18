import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Eye, EyeOff, Monitor, Moon, RotateCcw, Sun } from 'lucide-react'
import type { Layout, ThemeSetting } from '@shared/types'
import { isInstalled, sortModules, useStore } from '../store'
import ModuleIcon from './ModuleIcon'
import Brandmark from './Brandmark'

const MOD = /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl+'
const GLOBAL = /Mac/i.test(navigator.platform) ? '⌘⌥Espace' : 'Ctrl+Alt+Espace'

const THEMES: { id: ThemeSetting; label: string; icon: JSX.Element }[] = [
  { id: 'dark', label: 'Sombre', icon: <Moon size={14} /> },
  { id: 'light', label: 'Clair', icon: <Sun size={14} /> },
  { id: 'system', label: 'Système', icon: <Monitor size={14} /> }
]

const ACCENTS = ['#7c6ff7', '#3b82f6', '#06b6d4', '#10b981', '#84cc16', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#a855f7']

function Choice<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }): JSX.Element {
  return (
    <div className="segmented">
      {options.map(([v, label]) => (
        <button key={String(v)} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  )
}

function Row({ name, desc, children }: { name: string; desc?: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="setting">
      <div>
        <div className="setting-name">{name}</div>
        {desc && <div className="setting-desc">{desc}</div>}
      </div>
      {children}
    </div>
  )
}

/** Tout ce qui se règle dans l'apparence et l'agencement d'Open Studio. */
function Customize(): JSX.Element {
  const { settings, modules, setLayout } = useStore()
  const l = settings.layout
  const set = (p: Partial<Layout>): void => void setLayout(p)
  const list = sortModules(modules.filter(isInstalled), l.order)
  const move = (i: number, d: number): void => {
    const ids = list.map((m) => m.id)
    const [x] = ids.splice(i, 1)
    ids.splice(i + d, 0, x)
    set({ order: ids })
  }
  const toggle = (id: string): void => set({ hidden: l.hidden.includes(id) ? l.hidden.filter((h) => h !== id) : [...l.hidden, id] })
  return (
    <section className="panel">
      <div className="setting-head">
        <div className="setting-name">Personnaliser</div>
        <button className="btn btn-ghost btn-sm" onClick={() => void setLayout(null)}>
          <RotateCcw size={13} /> Tout réinitialiser
        </button>
      </div>
      <Row name="Couleur d’accent" desc="Boutons, sélections et liens d’Open Studio.">
        <div className="swatches">
          {ACCENTS.map((c) => (
            <button key={c} className={`swatch${l.accent === c ? ' on' : ''}`} style={{ background: c }} onClick={() => set({ accent: c })} title={c} />
          ))}
          <input type="color" value={l.accent ?? '#7c6ff7'} onChange={(e) => set({ accent: e.target.value })} title="Couleur libre" />
          {l.accent && (
            <button className="btn btn-ghost btn-sm" onClick={() => set({ accent: null })}>
              Par défaut
            </button>
          )}
        </div>
      </Row>
      <Row name="Barre des modules" desc="Place et taille. Tu peux aussi glisser les icônes pour les réordonner.">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Choice value={l.railSide} options={[['left', 'Gauche'], ['right', 'Droite']]} onChange={(railSide) => set({ railSide })} />
          <Choice value={l.railSize} options={[['small', 'Petite'], ['normal', 'Normale'], ['large', 'Grande']]} onChange={(railSize) => set({ railSize })} />
        </div>
      </Row>
      <Row name="Coins" desc="Plus ou moins arrondis.">
        <Choice value={l.radius} options={[['sharp', 'Droits'], ['normal', 'Normaux'], ['round', 'Arrondis']]} onChange={(radius) => set({ radius })} />
      </Row>
      <Row name="Taille de l’interface" desc="Agrandit ou réduit tout Open Studio.">
        <Choice value={l.scale} options={[[0.9, '90 %'], [1, '100 %'], [1.1, '110 %'], [1.25, '125 %']]} onChange={(scale) => set({ scale })} />
      </Row>
      <Row name="Accueil" desc="Affichage de tes modules et sections visibles. Glisse les tuiles pour les ordonner.">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
          <Choice value={l.homeView} options={[['tiles', 'Tuiles'], ['list', 'Liste']]} onChange={(homeView) => set({ homeView })} />
          <Choice value={l.showHero ? 'y' : 'n'} options={[['y', 'Avec titre'], ['n', 'Sans titre']]} onChange={(v) => set({ showHero: v === 'y' })} />
          <Choice value={l.showDiscover ? 'y' : 'n'} options={[['y', 'Avec « À découvrir »'], ['n', 'Sans']]} onChange={(v) => set({ showDiscover: v === 'y' })} />
        </div>
      </Row>
      <div className="setting-name" style={{ marginTop: 14, marginBottom: 8 }}>Ordre et visibilité des modules</div>
      {list.length === 0 && <div className="setting-desc">Installe des modules pour les organiser ici.</div>}
      {list.map((m, i) => {
        const off = l.hidden.includes(m.id)
        return (
          <div key={m.id} className={`cust-row${off ? ' off' : ''}`}>
            <ModuleIcon module={m} size={26} />
            <span className="grow">{m.name}</span>
            <button className="btn btn-ghost btn-icon" disabled={i === 0} onClick={() => move(i, -1)} title="Monter">
              <ArrowUp size={14} />
            </button>
            <button className="btn btn-ghost btn-icon" disabled={i === list.length - 1} onClick={() => move(i, 1)} title="Descendre">
              <ArrowDown size={14} />
            </button>
            <button className="btn btn-ghost btn-icon" onClick={() => toggle(m.id)} title={off ? 'Afficher dans la barre' : 'Masquer de la barre'}>
              {off ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        )
      })}
    </section>
  )
}

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

        <Customize />

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
