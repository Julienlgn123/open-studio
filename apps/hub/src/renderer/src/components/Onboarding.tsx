import { useState } from 'react'
import { ChevronLeft, ChevronRight, DownloadCloud, LayoutGrid, RefreshCw } from 'lucide-react'
import Brandmark from './Brandmark'

interface Step {
  label: string
  title: string
  text: string
  art: JSX.Element
}

const STEPS: Step[] = [
  {
    label: 'Bienvenue',
    title: 'Toute la suite, depuis un seul endroit',
    text: 'Open Studio rassemble les apps de la suite — Cours Studio, Drive Studio, Local IA Studio… Découvre-les, installe-les et lance-les d’ici, sans chercher d’installateur.',
    art: <Brandmark size={64} />
  },
  {
    label: 'Installation',
    title: 'De vraies apps, installées pour de vrai',
    text: 'Open Studio télécharge l’installateur officiel de chaque app et l’installe proprement. Tes données dans chaque app ne sont jamais touchées, même quand tu désinstalles.',
    art: <DownloadCloud size={44} strokeWidth={1.5} />
  },
  {
    label: 'Mises à jour',
    title: 'Toujours à jour, sans y penser',
    text: 'Open Studio vérifie les nouvelles versions toutes les 30 minutes. Il se met à jour lui-même, et met à jour tes apps dès qu’elles sont fermées — jamais pendant que tu t’en sers.',
    art: <RefreshCw size={44} strokeWidth={1.5} />
  },
  {
    label: 'Bibliothèque',
    title: 'Retrouve tout en un coup d’œil',
    text: 'La barre de gauche sépare tes apps installées, les mises à jour et chaque catégorie. Utilise la recherche pour aller droit au but.',
    art: <LayoutGrid size={44} strokeWidth={1.5} />
  }
]

export default function Onboarding({ onClose }: { onClose: () => void }): JSX.Element {
  const [step, setStep] = useState(0)
  const isLast = step === STEPS.length - 1
  const current = STEPS[step]

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-art" key={step}>
          {current.art}
        </div>
        <div className="modal-body">
          <div className="modal-step">
            {step + 1}/{STEPS.length} · {current.label}
          </div>
          <div className="modal-title">{current.title}</div>
          <p className="modal-text">{current.text}</p>
        </div>
        <div className="modal-foot">
          <div className="dots">
            {STEPS.map((s, i) => (
              <span key={s.label} className={i === step ? 'on' : ''} />
            ))}
          </div>
          {step > 0 ? (
            <button className="btn btn-sm btn-ghost" onClick={() => setStep((s) => s - 1)}>
              <ChevronLeft size={14} />
              Retour
            </button>
          ) : (
            <button className="btn btn-sm btn-ghost" onClick={onClose}>
              Passer
            </button>
          )}
          <button className="btn btn-sm btn-primary" onClick={() => (isLast ? onClose() : setStep((s) => s + 1))}>
            {isLast ? 'Commencer' : 'Suivant'}
            {!isLast && <ChevronRight size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}
