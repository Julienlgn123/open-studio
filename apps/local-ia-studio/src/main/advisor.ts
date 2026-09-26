import type { EngineKind, HardwareInfo, ModelAdvice, ModelAdviceDownload } from '@shared/types'

export interface InstalledModel {
  engine: EngineKind
  id: string
  name: string
  sizeGb: number | null
  params: string | null
}

// Modèles Ollama courants que le conseiller peut proposer au téléchargement (taille réelle du Q4).
const CATALOG = [
  { model: 'llama3.2:1b', sizeGb: 1.3, use: 'très léger, questions simples' },
  { model: 'llama3.2:3b', sizeGb: 2.0, use: 'léger et polyvalent' },
  { model: 'qwen2.5:3b', sizeGb: 1.9, use: 'léger, bon en français' },
  { model: 'gemma3:4b', sizeGb: 3.3, use: 'léger, lit les images' },
  { model: 'qwen2.5:7b', sizeGb: 4.7, use: 'polyvalent, très bon en français' },
  { model: 'mistral:7b', sizeGb: 4.1, use: 'polyvalent, rédaction' },
  { model: 'qwen2.5-coder:7b', sizeGb: 4.7, use: 'programmation' },
  { model: 'qwen3:8b', sizeGb: 5.2, use: 'raisonnement (réfléchit avant de répondre)' },
  { model: 'deepseek-r1:8b', sizeGb: 5.2, use: 'raisonnement, maths' },
  { model: 'llava:7b', sizeGb: 4.7, use: 'analyse d’images' },
  { model: 'gemma3:12b', sizeGb: 8.1, use: 'qualité élevée, lit les images' },
  { model: 'qwen2.5:14b', sizeGb: 9.0, use: 'qualité élevée, analyse de texte long' },
  { model: 'qwen2.5-coder:14b', sizeGb: 9.0, use: 'programmation avancée' },
  { model: 'phi4:14b', sizeGb: 9.1, use: 'raisonnement, maths' },
  { model: 'qwen3:14b', sizeGb: 9.3, use: 'raisonnement avancé' },
  { model: 'gemma3:27b', sizeGb: 17, use: 'très haute qualité, GPU puissant requis' }
]

const SYSTEM_PROMPT = `Tu es le conseiller de modèles de « Local IA Studio », une app qui fait tourner des IA en local (Ollama, fichiers GGUF, ou LM Studio avec des modèles MLX sur Mac) et peut aussi utiliser Mistral dans le cloud.
À partir de la tâche de l'utilisateur, de son matériel et des modèles qu'il a déjà, recommande le meilleur compromis vitesse / qualité.

Règles :
- Un modèle tient bien s'il rentre dans la VRAM libre (taille du fichier + ~1 Go). Sinon il déborde sur la RAM et devient 3 à 10 fois plus lent. Sans GPU, vise ≤ 4 Go.
- Sur Apple Silicon (mémoire unifiée), la RAM sert de VRAM. Les modèles MLX (moteur « lmstudio ») y sont nettement plus rapides que les GGUF : s'il en a un qui convient, préfère-le ; sinon, dans le résumé, conseille d'installer LM Studio et un modèle MLX (Modèles → MLX).
- Préfère un modèle déjà installé s'il convient à la tâche.
- Images jointes → modèle vision (gemma3, llava, qwen2.5vl). Code → modèles « coder ». Maths/logique → modèles de raisonnement.
- Propose au plus 3 téléchargements, pris de préférence dans le catalogue fourni, adaptés au matériel.
- Mets use_cloud à true seulement si aucun modèle local raisonnable ne peut bien faire la tâche (ou si la machine est trop faible).
- Réponds en français, phrases courtes et concrètes (mentionne la VRAM/RAM quand c'est utile).

Réponds UNIQUEMENT avec un objet JSON de cette forme :
{
  "summary": "1 à 2 phrases de conclusion",
  "best_installed": { "engine": "ollama" | "llamacpp" | "lmstudio", "model": "<id exact d'un modèle installé>", "reason": "..." } | null,
  "to_download": [ { "model": "<nom Ollama, ex. qwen2.5:7b>", "size_gb": 4.7, "speed": "rapide" | "moyen" | "lent", "reason": "..." } ],
  "use_cloud": true | false,
  "cloud_reason": "..." | null
}`

interface RawAdvice {
  summary?: unknown
  best_installed?: { engine?: unknown; model?: unknown; reason?: unknown } | null
  to_download?: { model?: unknown; size_gb?: unknown; speed?: unknown; reason?: unknown }[]
  use_cloud?: unknown
  cloud_reason?: unknown
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** Envoie (consignes système, message) à un modèle et renvoie son JSON brut. */
export type JsonCompleter = (system: string, user: string) => Promise<{ json: string; by: string | null }>

export async function recommendModel(
  complete: JsonCompleter,
  task: string,
  hardware: HardwareInfo,
  installed: InstalledModel[],
  ollamaAvailable: boolean
): Promise<ModelAdvice> {
  const context = {
    tache: task.trim() || '(pas de tâche précise : usage général, conversation et rédaction)',
    materiel: hardware,
    ollama_installe: ollamaAvailable,
    modeles_installes: installed.map((m) => ({ engine: m.engine, id: m.id, nom: m.name, taille_go: m.sizeGb, params: m.params })),
    catalogue: CATALOG
  }
  const { json, by } = await complete(SYSTEM_PROMPT, JSON.stringify(context, null, 1))
  let raw: RawAdvice
  try {
    // Un modèle local peut entourer le JSON de texte : on garde le premier objet.
    raw = JSON.parse(json.slice(json.indexOf('{'), json.lastIndexOf('}') + 1)) as RawAdvice
  } catch {
    throw new Error('Le conseiller a renvoyé une réponse illisible, réessaie.')
  }

  // On ne fait pas confiance aveuglément au JSON : un modèle « installé » doit exister vraiment.
  const bi = raw.best_installed
  const match = bi ? installed.find((m) => m.id === str(bi.model) || m.name === str(bi.model)) : undefined
  const toDownload: ModelAdviceDownload[] = (Array.isArray(raw.to_download) ? raw.to_download : [])
    .map((d) => {
      const model = str(d.model)
      const speed = str(d.speed)
      return {
        engine: 'ollama' as const,
        model,
        sizeGb: typeof d.size_gb === 'number' ? d.size_gb : (CATALOG.find((c) => c.model === model)?.sizeGb ?? null),
        speed: (speed === 'rapide' || speed === 'lent' ? speed : 'moyen') as ModelAdviceDownload['speed'],
        reason: str(d.reason)
      }
    })
    .filter((d) => /^[\w.\-/]+(:[\w.\-]+)?$/.test(d.model) && !installed.some((m) => m.engine === 'ollama' && m.id === d.model))
    .slice(0, 3)

  // Modèle annoncé « installé » alors qu'il ne l'est pas : on le propose au téléchargement à la place.
  let summary = str(raw.summary)
  const claimed = str(bi?.model)
  if (bi && !match && /^[\w.\-/]+:[\w.\-]+$/.test(claimed) && !toDownload.some((d) => d.model === claimed)) {
    toDownload.unshift({
      engine: 'ollama',
      model: claimed,
      sizeGb: CATALOG.find((c) => c.model === claimed)?.sizeGb ?? null,
      speed: 'rapide',
      reason: str(bi.reason)
    })
    toDownload.splice(3)
    summary = summary.replace(/\(?\s*déjà installé\s*\)?/gi, '(à télécharger)')
  }

  return {
    answeredBy: by,
    summary: summary || 'Voici ce que je te conseille.',
    bestInstalled: match ? { engine: match.engine, model: match.id, reason: str(bi?.reason) } : null,
    toDownload,
    useCloud: raw.use_cloud === true,
    cloudReason: str(raw.cloud_reason) || null
  }
}
