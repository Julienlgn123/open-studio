import { useState } from 'react'
import { ChevronLeft, ChevronRight, DownloadCloud, RefreshCw, SlidersHorizontal } from 'lucide-react'
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
    title: 'Open Studio, le point d’entrée de toute la suite',
    text: 'Un seul endroit pour découvrir, installer et lancer chaque app de la suite — Cours Studio, Drive Studio et les suivantes. Pas besoin d’aller chercher un installateur sur chaque site.',
    art: <Brandmark size={56} />
  },
  {
    label: 'Installation',
    title: 'De vrais installateurs, pas des raccourcis',
    text: 'Quand tu installes une app depuis le catalogue, Open Studio télécharge son vrai installateur natif et l’installe pour de vrai — sans jamais toucher aux données déjà présentes de cette app si tu l’avais installée toi-même avant.',
    art: <DownloadCloud size={40} strokeWidth={1.6} />
  },
  {
    label: 'Mises à jour',
    title: 'Les mises à jour, centralisées ici',
    text: 'Open Studio vérifie les nouvelles versions de chaque app et te propose de les installer en un clic. Les apps elles-mêmes ne se mettent plus à jour toutes seules — tout se passe depuis ce catalogue.',
    art: <RefreshCw size={40} strokeWidth={1.6} />
  },
  {
    label: 'Catalogue',
    title: 'Filtre et trie comme tu veux',
    text: 'Utilise les catégories en haut du catalogue pour filtrer par type d’outil, et le menu de tri pour remonter en premier ce qui est déjà installé. Prêt à explorer ?',
    art: <SlidersHorizontal size={40} strokeWidth={1.6} />
  }
]

export default function Onboarding({ onClose }: { onClose: () => void }): JSX.Element {
  const [step, setStep] = useState(0)
  const isLast = step === STEPS.length - 1
  const current = STEPS[step]

  return (
    <div className="onboarding-overlay" onClick={onClose}>
      <div className="onboarding-modal fade-in" onClick={(e) => e.stopPropagation()}>
        <button className="onboarding-skip" onClick={onClose}>
          Passer
        </button>
        <div className="onboarding-art">{current.art}</div>

        <div className="onboarding-body">
          <div className="onboarding-step-label">{current.label}</div>
          <div className="onboarding-title">{current.title}</div>
          <p className="onboarding-text">{current.text}</p>
        </div>

        <div className="onboarding-footer">
          <div className="onboarding-dots">
            {STEPS.map((s, i) => (
              <span key={s.label} className={`onboarding-dot${i === step ? ' active' : ''}`} />
            ))}
          </div>
          <div className="row" style={{ gap: 8 }}>
            {step > 0 && (
              <button className="btn btn-sm btn-secondary" onClick={() => setStep((s) => s - 1)}>
                <ChevronLeft size={13} />
                Retour
              </button>
            )}
            <button
              className="btn btn-sm btn-primary"
              onClick={() => (isLast ? onClose() : setStep((s) => s + 1))}
            >
              {isLast ? 'Commencer' : 'Suivant'}
              {!isLast && <ChevronRight size={13} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
