import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, History, Plus, Search } from 'lucide-react'
import { isInstalled, useStore } from '../store'
import Brandmark from './Brandmark'
import ModuleIcon from './ModuleIcon'

const MAC = /Mac/i.test(navigator.platform)
const MOD = MAC ? '⌘' : 'Ctrl'

/** Visite guidée en 3 écrans, au premier lancement (et depuis les réglages). */
export default function Tour(): JSX.Element | null {
  const { tour, closeTour, modules, go } = useStore()
  const [step, setStep] = useState(0)
  const last = step === 2

  useEffect(() => {
    if (tour) setStep(0)
  }, [tour])

  useEffect(() => {
    if (!tour) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeTour()
      else if (e.key === 'ArrowRight') setStep((s) => Math.min(2, s + 1))
      else if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tour])

  if (!tour) return null

  const finish = (): void => {
    closeTour()
    // Rien d'installé : on emmène directement au catalogue.
    if (!modules.some(isInstalled)) go({ kind: 'store' })
  }
  const sample = modules.slice(0, 3)

  const steps = [
    {
      title: 'Bienvenue dans Open Studio',
      body: 'Une seule app pour tous tes outils. Chaque outil est un module : tu ajoutes seulement ceux dont tu as besoin, et tu passes de l’un à l’autre par la barre de gauche.',
      art: (
        <div className="tour-rail">
          <span className="tour-rail-btn on">
            <Brandmark size={22} />
          </span>
          <span className="tour-rail-sep" />
          {sample.map((m) => (
            <span key={m.id} className="tour-rail-btn">
              <ModuleIcon module={m} size={30} />
            </span>
          ))}
          <span className="tour-rail-btn add">
            <Plus size={16} />
          </span>
        </div>
      )
    },
    {
      title: 'Ajoute tes modules',
      body: 'Le bouton + ouvre le catalogue. Tu avais déjà une ancienne app ? Le module reprend ses données tout seul. Et retirer un module ne supprime jamais tes données.',
      art: (
        <div className="tour-cards">
          {sample.map((m, i) => (
            <div key={m.id} className="tour-card" style={{ ['--accent-m' as string]: m.accent, animationDelay: `${i * 80}ms` }}>
              <ModuleIcon module={m} size={34} />
              <span>{m.name}</span>
              {m.legacy?.hasData && (
                <span className="chip success">
                  <History size={11} /> Données reprises
                </span>
              )}
            </div>
          ))}
        </div>
      )
    },
    {
      title: 'Va plus vite',
      body: 'Quelques raccourcis à retenir. Fermer la fenêtre ne quitte pas Open Studio : il reste près de l’horloge, et tes modules continuent leurs sauvegardes et rappels.',
      art: (
        <div className="tour-keys">
          <div>
            <span className="tour-combo">
              <kbd>{MOD}</kbd>
              <kbd>K</kbd>
            </span>
            <span>
              <Search size={13} /> Aller à un module
            </span>
          </div>
          <div>
            <span className="tour-combo">
              <kbd>{MOD}</kbd>
              <kbd>1</kbd>…<kbd>9</kbd>
            </span>
            <span>Passer d’un module à l’autre</span>
          </div>
          <div>
            <span className="tour-combo">
              <kbd>{MOD}</kbd>
              <kbd>{MAC ? '⌥' : 'Alt'}</kbd>
              <kbd>Espace</kbd>
            </span>
            <span>Ouvrir Open Studio de partout</span>
          </div>
        </div>
      )
    }
  ]
  const s = steps[step]

  return (
    <div className="overlay">
      <div className="tour" key={step}>
        <div className="tour-art">{s.art}</div>
        <div className="tour-body">
          <div className="tour-step">Étape {step + 1} sur 3</div>
          <h2>{s.title}</h2>
          <p>{s.body}</p>
        </div>
        <div className="tour-foot">
          <div className="tour-dots">
            {steps.map((_, i) => (
              <button key={i} className={i === step ? 'on' : ''} onClick={() => setStep(i)} aria-label={`Étape ${i + 1}`} />
            ))}
          </div>
          <div className="actions">
            {step === 0 ? (
              <button className="btn btn-ghost" onClick={closeTour}>
                Passer
              </button>
            ) : (
              <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>
                <ArrowLeft size={14} /> Retour
              </button>
            )}
            <button className="btn btn-primary" autoFocus onClick={() => (last ? finish() : setStep(step + 1))}>
              {last ? (modules.some(isInstalled) ? 'C’est parti' : 'Choisir mes modules') : 'Suivant'}
              {!last && <ArrowRight size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
