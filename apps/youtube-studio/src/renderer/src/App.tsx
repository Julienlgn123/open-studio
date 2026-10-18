import { useEffect, useMemo, useState } from 'react'
import { Copy, FileDown, History, Languages, Link2, ListChecks, Search, Settings, Sparkles, Trash2, Youtube } from 'lucide-react'
import { Empty, Layout, Modal, Segmented, SideTitle, Toasts, errorText, relativeTime, toast, usePersisted } from '@ui'
import type { AiSettings, HistoryItem, Line, Provider, Track, VideoInfo } from '../../shared/types'
import './yt.css'

const clock = (s: number): string => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(sec).padStart(2, '0')}`
}

/** Meilleure piste : française écrite à la main, sinon française automatique, sinon la première. */
function bestTrack(tracks: Track[]): Track | null {
  return tracks.find((t) => t.lang.startsWith('fr') && !t.auto) ?? tracks.find((t) => t.lang.startsWith('fr')) ?? tracks.find((t) => !t.auto) ?? tracks[0] ?? null
}

type Tab = 'summary' | 'cards' | 'transcript'

export default function App(): JSX.Element {
  const [url, setUrl] = useState('')
  const [history, setHistory] = usePersisted<HistoryItem[]>('history', [])
  const [current, setCurrent] = useState<HistoryItem | null>(null)
  const [info, setInfo] = useState<VideoInfo | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('summary')
  const [showSettings, setShowSettings] = useState(false)
  const [q, setQ] = useState('')

  useEffect(() => window.kit.on('yt:step', (s: string) => setBusy(s)), [])

  const save = (item: HistoryItem): void => {
    setCurrent(item)
    setHistory((h) => [item, ...h.filter((x) => x.id !== item.id)].slice(0, 60))
  }

  const load = async (track: Track | null, vi: VideoInfo, translate?: string): Promise<void> => {
    if (!track) {
      setBusy(null)
      toast('Cette vidéo n’a pas de sous-titres, même automatiques : impossible de la transcrire.', 'error')
      return
    }
    setBusy('Récupération de la transcription…')
    try {
      const lines = await window.kit.invoke<Line[]>('yt:lines', track, translate)
      save({ id: vi.id, title: vi.title, author: vi.author, thumbnail: vi.thumbnail, seconds: vi.seconds, lang: translate ?? track.lang, lines, analysis: null, at: Date.now() })
      setTab('transcript')
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  const open = async (): Promise<void> => {
    setBusy('Recherche de la vidéo…')
    try {
      const vi = await window.kit.invoke<VideoInfo>('yt:info', url)
      setInfo(vi)
      setUrl('')
      await load(bestTrack(vi.tracks), vi)
    } catch (err) {
      setBusy(null)
      toast(errorText(err), 'error')
    }
  }

  const analyze = async (): Promise<void> => {
    if (!current) return
    setBusy('Préparation…')
    try {
      const analysis = await window.kit.invoke<HistoryItem['analysis']>('yt:analyze', current.title, current.lines)
      save({ ...current, analysis })
      setTab('summary')
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  const markdown = (it: HistoryItem): string =>
    [
      `# ${it.title}`,
      `${it.author} · https://youtu.be/${it.id}`,
      '',
      ...(it.analysis
        ? ['## Résumé', '', it.analysis.summary, '', '## Points clés', '', ...it.analysis.points.map((p) => `- ${p}`), '', '## Flashcards', '', ...it.analysis.cards.map((c) => `**${c.q}**\n${c.a}\n`)]
        : []),
      '## Transcription',
      '',
      ...it.lines.map((l) => `[${clock(l.t)}] ${l.text}`)
    ].join('\n')

  const exportMd = async (): Promise<void> => {
    if (!current) return
    const path = await window.kit.files.save({ defaultPath: `${current.title.replace(/[<>:"/\\|?*]/g, '-').slice(0, 80)}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] })
    if (!path) return
    await window.kit.files.writeText(path, markdown(current))
    toast('Exporté en Markdown', 'success')
  }

  const lines = useMemo(() => {
    if (!current) return []
    const query = q.trim().toLowerCase()
    return query ? current.lines.filter((l) => l.text.toLowerCase().includes(query)) : current.lines
  }, [current, q])

  return (
    <Layout
      side={
        <>
          <SideTitle>Résumé YouTube</SideTitle>
          <div className="ui-side-section">
            <History size={11} /> Historique
          </div>
          {history.map((h) => (
            <button key={h.id} className={`hist${current?.id === h.id ? ' on' : ''}`} onClick={() => setCurrent(h)}>
              <img src={h.thumbnail} alt="" />
              <span>
                <b>{h.title}</b>
                <span className="faint">
                  {h.analysis ? '✨ ' : ''}
                  {relativeTime(h.at)}
                </span>
              </span>
            </button>
          ))}
          {!history.length && <p className="faint" style={{ padding: '4px 10px' }}>Tes vidéos apparaîtront ici.</p>}
          <div className="ui-side-foot">
            <button className="ui-nav" onClick={() => setShowSettings(true)}>
              <Settings size={15} />
              <span>Réglages de l’IA</span>
            </button>
          </div>
        </>
      }
    >
      <div className="ui-toolbar url-bar">
        <Link2 size={16} className="faint" />
        <input
          className="url-input"
          placeholder="Colle un lien YouTube (vidéo, Short, youtu.be…) puis Entrée"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && url.trim() && !busy && void open()}
          autoFocus
        />
        <button className="btn btn-primary btn-sm" disabled={!url.trim() || !!busy} onClick={() => void open()}>
          Transcrire
        </button>
      </div>

      {busy && (
        <div className="busy">
          <span className="spinner" /> {busy}
        </div>
      )}

      {!current ? (
        <Empty icon={<Youtube size={24} />} title="Une vidéo, son texte et son résumé">
          Colle un lien YouTube : tu obtiens la transcription horodatée, puis en un clic un résumé, les points clés et des flashcards pour réviser.
        </Empty>
      ) : (
        <div className="ui-page">
          <div className="ui-page-inner">
            <div className="video">
              <img className="thumb" src={current.thumbnail} alt="" onClick={() => void window.kit.openExternal(`https://youtu.be/${current.id}`)} />
              <div className="video-text">
                <h1>{current.title}</h1>
                <div className="faint">
                  {current.author} · {clock(current.seconds)} · sous-titres {current.lang}
                </div>
                <div className="ui-row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
                  <button className="btn btn-primary" onClick={() => void analyze()} disabled={!!busy}>
                    <Sparkles size={14} /> {current.analysis ? 'Refaire le résumé' : 'Résumer avec l’IA'}
                  </button>
                  {info?.id === current.id && info.tracks.length > 1 && (
                    <select
                      className="select"
                      style={{ width: 'auto' }}
                      value=""
                      onChange={(e) => {
                        const [i, tr] = e.target.value.split('|')
                        void load(info.tracks[Number(i)], info, tr || undefined)
                      }}
                    >
                      <option value="">Autre langue…</option>
                      {info.tracks.map((t, i) => (
                        <option key={i} value={`${i}|`}>
                          {t.name}
                          {t.auto ? ' (auto)' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                  <button className="btn btn-ghost" onClick={() => void window.kit.clipboard.write(markdown(current)).then(() => toast('Copié', 'success'))}>
                    <Copy size={14} /> Copier
                  </button>
                  <button className="btn btn-ghost" onClick={() => void exportMd()}>
                    <FileDown size={14} /> Markdown
                  </button>
                  <button
                    className="btn btn-ghost btn-icon"
                    title="Retirer de l’historique"
                    onClick={() => {
                      setHistory((h) => h.filter((x) => x.id !== current.id))
                      setCurrent(null)
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>

            <div className="tabs">
              <Segmented<Tab>
                value={tab}
                onChange={setTab}
                options={[
                  { id: 'summary', label: <><Sparkles size={13} /> Résumé</> },
                  { id: 'cards', label: <><ListChecks size={13} /> Flashcards {current.analysis ? `(${current.analysis.cards.length})` : ''}</> },
                  { id: 'transcript', label: <><Languages size={13} /> Transcription</> }
                ]}
              />
            </div>

            {tab === 'summary' &&
              (current.analysis ? (
                <div className="ui-col">
                  <section className="ui-card">
                    <div className="ui-card-title">Résumé</div>
                    {current.analysis.summary.split(/\n+/).map((p, i) => (
                      <p key={i} className="para">
                        {p}
                      </p>
                    ))}
                  </section>
                  {current.analysis.points.length > 0 && (
                    <section className="ui-card">
                      <div className="ui-card-title">Points clés</div>
                      <ul className="points">
                        {current.analysis.points.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </section>
                  )}
                  <div className="faint small">Généré par {current.analysis.model}. Vérifie toujours les informations importantes.</div>
                </div>
              ) : (
                <Empty icon={<Sparkles size={22} />} title="Pas encore de résumé" action={<button className="btn btn-primary" onClick={() => void analyze()} disabled={!!busy}>Résumer avec l’IA</button>}>
                  L’IA lit la transcription et en tire un résumé, les points clés et des flashcards.
                </Empty>
              ))}

            {tab === 'cards' &&
              (current.analysis?.cards.length ? (
                <div className="cards">
                  {current.analysis.cards.map((c, i) => (
                    <FlipCard key={i} q={c.q} a={c.a} />
                  ))}
                </div>
              ) : (
                <Empty icon={<ListChecks size={22} />} title="Pas encore de flashcards">
                  Lance « Résumer avec l’IA » pour les créer.
                </Empty>
              ))}

            {tab === 'transcript' && (
              <section className="ui-card transcript">
                <label className="search" style={{ marginBottom: 10 }}>
                  <Search size={14} />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher dans la transcription" />
                </label>
                {lines.map((l, i) => (
                  <div key={i} className="line">
                    <button className="time" onClick={() => void window.kit.openExternal(`https://youtu.be/${current.id}?t=${Math.floor(l.t)}`)} title="Ouvrir la vidéo à ce moment">
                      {clock(l.t)}
                    </button>
                    <span>{l.text}</span>
                  </div>
                ))}
              </section>
            )}
          </div>
        </div>
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <Toasts />
    </Layout>
  )
}

function FlipCard({ q, a }: { q: string; a: string }): JSX.Element {
  const [flip, setFlip] = useState(false)
  return (
    <button className={`flip${flip ? ' on' : ''}`} onClick={() => setFlip(!flip)}>
      <span className="flip-inner">
        <span className="flip-face front">
          <span className="faint small">Question</span>
          {q}
        </span>
        <span className="flip-face back">
          <span className="faint small">Réponse</span>
          {a}
        </span>
      </span>
    </button>
  )
}

function SettingsModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [s, setS] = useState<AiSettings | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [key, setKey] = useState('')
  useEffect(() => {
    window.kit.invoke<AiSettings>('yt:settings').then(setS)
    window.kit.invoke<string[]>('yt:models').then(setModels)
  }, [])
  const patch = (p: Partial<AiSettings>): void => void window.kit.invoke<AiSettings>('yt:setSettings', p).then(setS)
  if (!s) return <></>
  return (
    <Modal title="Réglages de l’IA" onClose={onClose} footer={<button className="btn btn-secondary" onClick={onClose}>Fermer</button>}>
      <Segmented<Provider>
        value={s.provider}
        onChange={(provider) => patch({ provider })}
        options={[
          { id: 'ollama', label: 'Ollama (local, gratuit)' },
          { id: 'mistral', label: 'Mistral (en ligne)' }
        ]}
      />
      {s.provider === 'ollama' ? (
        <div className="field">
          <label className="field-label">Modèle</label>
          {models.length ? (
            <select className="select" value={s.ollamaModel || models[0]} onChange={(e) => patch({ ollamaModel: e.target.value })}>
              {models.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          ) : (
            <div className="callout warn">Ollama ne répond pas ou n’a aucun modèle. Lance-le, ou installe un modèle avec le module Local IA Studio.</div>
          )}
          <span className="field-hint">Tout reste sur ton PC. Plus le modèle est gros, meilleur (et plus lent) est le résumé.</span>
        </div>
      ) : (
        <>
          <div className="field">
            <label className="field-label">Clé API Mistral {s.hasMistralKey && <span className="chip success">enregistrée</span>}</label>
            <div className="ui-row">
              <input className="input mono" type="password" placeholder={s.hasMistralKey ? '••••••••••••' : 'Colle ta clé'} value={key} onChange={(e) => setKey(e.target.value)} />
              <button
                className="btn btn-secondary"
                disabled={!key.trim()}
                onClick={() =>
                  void window.kit.invoke<AiSettings>('yt:setMistralKey', key).then((x) => {
                    setS(x)
                    setKey('')
                    toast('Clé enregistrée (chiffrée sur ce PC)', 'success')
                  })
                }
              >
                Enregistrer
              </button>
            </div>
            <span className="field-hint">
              Gratuite sur{' '}
              <button className="linkish" onClick={() => void window.kit.openExternal('https://console.mistral.ai/api-keys')}>
                console.mistral.ai
              </button>
              . La transcription est envoyée à Mistral pour le résumé.
            </span>
          </div>
          <div className="field">
            <label className="field-label">Modèle</label>
            <select className="select" value={s.mistralModel} onChange={(e) => patch({ mistralModel: e.target.value })}>
              <option value="mistral-small-latest">Mistral Small (rapide)</option>
              <option value="mistral-medium-latest">Mistral Medium</option>
              <option value="mistral-large-latest">Mistral Large (meilleur)</option>
            </select>
          </div>
        </>
      )}
    </Modal>
  )
}
