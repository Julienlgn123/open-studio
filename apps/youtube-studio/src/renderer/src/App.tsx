import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  Copy,
  FileDown,
  GraduationCap,
  History,
  Languages,
  Link2,
  ListChecks,
  MessageCircleQuestion,
  NotebookPen,
  RotateCcw,
  Search,
  Send,
  Settings,
  Shuffle,
  Sparkles,
  Star,
  Trash2,
  X,
  Youtube
} from 'lucide-react'
import { Empty, Layout, Modal, Segmented, SideTitle, Toasts, errorText, relativeTime, toast, uid, usePersisted } from '@ui'
import type { AiSettings, AnalyzeOptions, HistoryItem, Line, Provider, QA, QuizQuestion, Track, VideoInfo } from '../../shared/types'
import './yt.css'

const clock = (s: number): string => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(sec).padStart(2, '0')}`
}
const srtTime = (s: number): string => {
  const ms = Math.round(s * 1000)
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const sec = Math.floor((ms % 60_000) / 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`
}
const safe = (s: string): string => s.replace(/[<>:"/\\|?*]/g, '-').slice(0, 80)

/**
 * Meilleure piste : le français s'il existe ; sinon la langue parlée dans la vidéo (celle des
 * sous-titres automatiques de YouTube), écrite à la main de préférence ; l'anglais en dernier recours.
 */
function bestTrack(tracks: Track[]): Track | null {
  const lang = (t: Track): string => t.lang.slice(0, 2)
  const spoken = tracks.find((t) => t.auto)
  const pick = (l: string): Track | undefined => tracks.find((t) => lang(t) === l && !t.auto) ?? tracks.find((t) => lang(t) === l)
  return pick('fr') ?? (spoken ? pick(lang(spoken)) : undefined) ?? pick('en') ?? tracks[0] ?? null
}

/** Texte avec [m:ss] cliquables (ouvrent la vidéo à ce moment). */
function Timed({ text, id }: { text: string; id: string }): JSX.Element {
  const parts = text.split(/(\[(?:\d+:)?\d{1,2}:\d{2}\])/g)
  return (
    <>
      {parts.map((p, i) => {
        const m = /^\[((?:\d+:)?\d{1,2}:\d{2})\]$/.exec(p)
        if (!m) return <span key={i}>{p}</span>
        const sec = m[1].split(':').reduce((a, n) => a * 60 + Number(n), 0)
        return (
          <button key={i} className="time inline" onClick={() => void window.kit.openExternal(`https://youtu.be/${id}?t=${sec}`)}>
            {m[1]}
          </button>
        )
      })}
    </>
  )
}

/** Petit Markdown pour les fiches : titres, listes, gras. */
function MiniMd({ text }: { text: string }): JSX.Element {
  const bold = (s: string, k: string): JSX.Element[] => s.split(/(\*\*[^*]+\*\*)/g).map((x, i) => (x.startsWith('**') ? <b key={`${k}${i}`}>{x.slice(2, -2)}</b> : <span key={`${k}${i}`}>{x}</span>))
  return (
    <div className="mini-md">
      {text.split('\n').map((l, i) => {
        if (/^#{1,3}\s/.test(l)) return <h3 key={i}>{bold(l.replace(/^#+\s/, ''), `h${i}`)}</h3>
        if (/^\s*[-*•]\s/.test(l)) return <li key={i}>{bold(l.replace(/^\s*[-*•]\s/, ''), `l${i}`)}</li>
        if (!l.trim()) return <br key={i} />
        return (
          <p key={i} className="para">
            {bold(l, `p${i}`)}
          </p>
        )
      })}
    </div>
  )
}

type Tab = 'summary' | 'ask' | 'quiz' | 'cards' | 'transcript' | 'notes'
const DEFAULT_OPTS: AnalyzeOptions = { length: 'normal', style: 'summary', lang: 'fr' }

export default function App(): JSX.Element {
  const [url, setUrl] = useState('')
  const [history, setHistory] = usePersisted<HistoryItem[]>('history', [])
  const [opts, setOpts] = usePersisted<AnalyzeOptions>('analyzeOptions', DEFAULT_OPTS)
  const [autoSummary, setAutoSummary] = usePersisted('autoSummary', false)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [info, setInfo] = useState<VideoInfo | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('summary')
  const [showSettings, setShowSettings] = useState(false)
  const [optsOpen, setOptsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [q, setQ] = useState('')
  const [histQ, setHistQ] = useState('')
  const [onlyFav, setOnlyFav] = useState(false)
  const [paragraphs, setParagraphs] = usePersisted('paragraphs', false)

  useEffect(() => window.kit.on('yt:step', (s: string) => setBusy(s)), [])

  const current = history.find((h) => h.id === currentId) ?? null
  const save = (item: HistoryItem): void => {
    setCurrentId(item.id)
    setHistory((h) => [item, ...h.filter((x) => x.id !== item.id)].slice(0, 100))
  }
  const patch = (id: string, p: Partial<HistoryItem>): void => setHistory((h) => h.map((x) => (x.id === id ? { ...x, ...p } : x)))

  const runAnalyze = async (item: HistoryItem): Promise<void> => {
    setBusy('Préparation…')
    try {
      const analysis = await window.kit.invoke<HistoryItem['analysis']>('yt:analyze', item.title, item.lines, { ...DEFAULT_OPTS, ...opts })
      patch(item.id, { analysis })
      setTab('summary')
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  const load = async (track: Track | null, vi: VideoInfo, translate?: string): Promise<HistoryItem | null> => {
    if (!track) {
      toast(`« ${vi.title} » n’a pas de sous-titres, même automatiques : impossible de la transcrire.`, 'error')
      return null
    }
    setBusy('Récupération de la transcription…')
    try {
      const lines = await window.kit.invoke<Line[]>('yt:lines', track, translate)
      const old = history.find((h) => h.id === vi.id)
      const item: HistoryItem = {
        ...old,
        id: vi.id,
        title: vi.title,
        author: vi.author,
        thumbnail: vi.thumbnail,
        seconds: vi.seconds,
        lang: translate ?? track.lang,
        lines,
        analysis: old?.lang === (translate ?? track.lang) ? (old?.analysis ?? null) : null,
        chapters: vi.chapters,
        at: Date.now()
      }
      save(item)
      setTab('transcript')
      return item
    } catch (err) {
      toast(errorText(err), 'error')
      return null
    } finally {
      setBusy(null)
    }
  }

  /** Un ou plusieurs liens (un par ligne ou séparés par des espaces). */
  const open = async (): Promise<void> => {
    const links = url.split(/[\s,]+/).filter((x) => /youtu|^[\w-]{11}$/.test(x))
    if (!links.length) return
    setUrl('')
    for (let i = 0; i < links.length; i++) {
      setBusy(links.length > 1 ? `Vidéo ${i + 1}/${links.length}…` : 'Recherche de la vidéo…')
      try {
        const vi = await window.kit.invoke<VideoInfo>('yt:info', links[i])
        setInfo(vi)
        const item = await load(bestTrack(vi.tracks), vi)
        if (item && autoSummary) await runAnalyze(item)
      } catch (err) {
        setBusy(null)
        toast(errorText(err), 'error')
      }
    }
    setBusy(null)
  }

  const markdown = (it: HistoryItem): string =>
    [
      `# ${it.title}`,
      `${it.author} · https://youtu.be/${it.id}`,
      '',
      ...(it.analysis
        ? ['## Résumé', '', it.analysis.summary, '', '## Points clés', '', ...it.analysis.points.map((p) => `- ${p}`), '', '## Flashcards', '', ...it.analysis.cards.map((c) => `**${c.q}**\n${c.a}\n`)]
        : []),
      ...(it.notes?.length ? ['## Mes notes', '', ...it.notes.map((n) => `- [${clock(n.t)}] ${n.text}`), ''] : []),
      ...(it.qa?.length ? ['## Questions posées', '', ...it.qa.map((x) => `**${x.q}**\n${x.a}\n`)] : []),
      '## Transcription',
      '',
      ...it.lines.map((l) => `[${clock(l.t)}] ${l.text}`)
    ].join('\n')

  const exportAs = async (kind: 'md' | 'txt' | 'srt' | 'anki'): Promise<void> => {
    setExportOpen(false)
    if (!current) return
    const name = safe(current.title)
    const content =
      kind === 'md'
        ? markdown(current)
        : kind === 'txt'
          ? current.lines.map((l) => l.text).join(' ').replace(/\s+/g, ' ')
          : kind === 'srt'
            ? current.lines.map((l, i) => `${i + 1}\n${srtTime(l.t)} --> ${srtTime(current.lines[i + 1]?.t ?? l.t + 4)}\n${l.text}\n`).join('\n')
            : (current.analysis?.cards ?? []).map((c) => `${c.q.replace(/;/g, ',')};${c.a.replace(/;/g, ',')}`).join('\n')
    if (kind === 'anki' && !content) return void toast('Pas encore de flashcards : lance d’abord le résumé.', 'info')
    const ext = kind === 'anki' ? 'csv' : kind
    const path = await window.kit.files.save({ defaultPath: `${name}${kind === 'anki' ? ' (flashcards)' : ''}.${ext}`, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] })
    if (!path) return
    await window.kit.files.writeText(path, content)
    toast(kind === 'anki' ? 'Flashcards exportées (importables dans Anki ou Quizlet)' : 'Exporté', 'success')
  }

  const lines = useMemo(() => {
    if (!current) return []
    const query = q.trim().toLowerCase()
    return query ? current.lines.filter((l) => l.text.toLowerCase().includes(query)) : current.lines
  }, [current, q])
  /** Transcription en paragraphes (environ toutes les 30 secondes, ou par chapitre). */
  const paras = useMemo(() => {
    if (!current || q) return []
    const out: { t: number; text: string; chapter?: string }[] = []
    const chapters = current.chapters ?? []
    let ci = 0
    for (const l of current.lines) {
      let chapter: string | undefined
      while (ci < chapters.length && chapters[ci].t <= l.t) chapter = chapters[ci++].title
      const last = out[out.length - 1]
      if (!last || chapter || l.t - last.t > 30) out.push({ t: l.t, text: l.text, chapter })
      else last.text += ` ${l.text}`
    }
    return out
  }, [current, q])

  const hist = history.filter((h) => (!onlyFav || h.fav) && (!histQ || `${h.title} ${h.author}`.toLowerCase().includes(histQ.toLowerCase())))
  const words = current ? current.lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0) : 0

  return (
    <Layout
      side={
        <>
          <SideTitle>Résumé YouTube</SideTitle>
          <label className="search side-search">
            <Search size={12} />
            <input value={histQ} onChange={(e) => setHistQ(e.target.value)} placeholder="Chercher une vidéo" />
          </label>
          <div className="ui-side-section side-row">
            <span>
              <History size={11} /> Historique
            </span>
            <button className={`btn btn-sm btn-icon ${onlyFav ? 'on' : 'btn-ghost'}`} onClick={() => setOnlyFav(!onlyFav)} title="Seulement les favoris">
              <Star size={12} fill={onlyFav ? 'currentColor' : 'none'} />
            </button>
          </div>
          {hist.map((h) => (
            <button key={h.id} className={`hist${current?.id === h.id ? ' on' : ''}`} onClick={() => setCurrentId(h.id)}>
              <img src={h.thumbnail} alt="" />
              <span>
                <b>{h.title}</b>
                <span className="faint">
                  {h.fav ? '★ ' : ''}
                  {h.analysis ? '✨ ' : ''}
                  {h.quiz ? '🎓 ' : ''}
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
          placeholder="Colle un ou plusieurs liens YouTube (vidéo, Short, youtu.be…) puis Entrée"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && url.trim() && !busy && void open()}
          autoFocus
        />
        <label className="ui-row faint auto-sum" title="Lance aussi le résumé dès que la transcription est prête">
          <input type="checkbox" checked={autoSummary} onChange={(e) => setAutoSummary(e.target.checked)} /> Résumer aussitôt
        </label>
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
          Colle un lien YouTube : transcription horodatée, puis résumé ou fiche de révision, questions à l’IA, quiz noté, flashcards et notes personnelles.
        </Empty>
      ) : (
        <div className="ui-page">
          <div className="ui-page-inner">
            <div className="video">
              <img className="thumb" src={current.thumbnail} alt="" onClick={() => void window.kit.openExternal(`https://youtu.be/${current.id}`)} />
              <div className="video-text">
                <h1>{current.title}</h1>
                <div className="faint">
                  {current.author} · {clock(current.seconds)} · sous-titres {current.lang} · {words.toLocaleString('fr-FR')} mots ({Math.max(1, Math.round(words / 230))} min de lecture)
                </div>
                <div className="ui-row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
                  <div className="split-btn">
                    <button className="btn btn-primary" onClick={() => void runAnalyze(current)} disabled={!!busy}>
                      <Sparkles size={14} /> {current.analysis ? 'Refaire le résumé' : 'Résumer avec l’IA'}
                    </button>
                    <button className="btn btn-primary btn-icon" onClick={() => setOptsOpen(true)} title="Options du résumé">
                      <ChevronDown size={14} />
                    </button>
                  </div>
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
                      {info.tracks.length > 0 && !current.lang.startsWith('fr') && <option value={`${info.tracks.indexOf(bestTrack(info.tracks)!)}|fr`}>Traduire en français (YouTube)</option>}
                    </select>
                  )}
                  <button className={`btn btn-icon ${current.fav ? 'on' : 'btn-ghost'}`} onClick={() => patch(current.id, { fav: !current.fav })} title="Favori">
                    <Star size={14} fill={current.fav ? 'currentColor' : 'none'} />
                  </button>
                  <button className="btn btn-ghost" onClick={() => void window.kit.clipboard.write(markdown(current)).then(() => toast('Copié', 'success'))}>
                    <Copy size={14} /> Copier
                  </button>
                  <div className="menu-wrap">
                    <button className="btn btn-ghost" onClick={() => setExportOpen(!exportOpen)}>
                      <FileDown size={14} /> Exporter <ChevronDown size={12} />
                    </button>
                    {exportOpen && (
                      <div className="menu" onMouseLeave={() => setExportOpen(false)}>
                        <button onClick={() => void exportAs('md')}>Tout en Markdown (.md)</button>
                        <button onClick={() => void exportAs('txt')}>Transcription en texte (.txt)</button>
                        <button onClick={() => void exportAs('srt')}>Sous-titres (.srt)</button>
                        <button onClick={() => void exportAs('anki')}>Flashcards pour Anki / Quizlet (.csv)</button>
                      </div>
                    )}
                  </div>
                  <button
                    className="btn btn-ghost btn-icon"
                    title="Retirer de l’historique"
                    onClick={() => {
                      setHistory((h) => h.filter((x) => x.id !== current.id))
                      setCurrentId(null)
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
                  { id: 'ask', label: <><MessageCircleQuestion size={13} /> Questions {current.qa?.length ? `(${current.qa.length})` : ''}</> },
                  { id: 'quiz', label: <><GraduationCap size={13} /> Quiz</> },
                  { id: 'cards', label: <><ListChecks size={13} /> Flashcards {current.analysis ? `(${current.analysis.cards.length})` : ''}</> },
                  { id: 'transcript', label: <><Languages size={13} /> Transcription</> },
                  { id: 'notes', label: <><NotebookPen size={13} /> Mes notes {current.notes?.length ? `(${current.notes.length})` : ''}</> }
                ]}
              />
            </div>

            {tab === 'summary' &&
              (current.analysis ? (
                <div className="ui-col">
                  <section className="ui-card">
                    <div className="ui-card-title">Résumé</div>
                    <MiniMd text={current.analysis.summary} />
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
                  {current.chapters && current.chapters.length > 0 && (
                    <section className="ui-card">
                      <div className="ui-card-title">Chapitres de la vidéo</div>
                      {current.chapters.map((c, i) => (
                        <div key={i} className="line">
                          <button className="time" onClick={() => void window.kit.openExternal(`https://youtu.be/${current.id}?t=${c.t}`)}>
                            {clock(c.t)}
                          </button>
                          <span>{c.title}</span>
                        </div>
                      ))}
                    </section>
                  )}
                  <div className="faint small">Généré par {current.analysis.model}. Vérifie toujours les informations importantes.</div>
                </div>
              ) : (
                <Empty icon={<Sparkles size={22} />} title="Pas encore de résumé" action={<button className="btn btn-primary" onClick={() => void runAnalyze(current)} disabled={!!busy}>Résumer avec l’IA</button>}>
                  L’IA lit la transcription et en tire un résumé (ou une fiche de révision, un plan de cours…), les points clés et des flashcards.
                </Empty>
              ))}

            {tab === 'ask' && <AskTab item={current} onChange={(qa) => patch(current.id, { qa })} />}
            {tab === 'quiz' && <QuizTab item={current} onChange={(quiz) => patch(current.id, { quiz })} />}

            {tab === 'cards' &&
              (current.analysis?.cards.length ? (
                <CardsTab cards={current.analysis.cards} known={current.known ?? []} onKnown={(known) => patch(current.id, { known })} />
              ) : (
                <Empty icon={<ListChecks size={22} />} title="Pas encore de flashcards">
                  Lance « Résumer avec l’IA » pour les créer.
                </Empty>
              ))}

            {tab === 'transcript' && (
              <section className="ui-card transcript">
                <div className="ui-row" style={{ marginBottom: 10 }}>
                  <label className="search" style={{ flex: 1 }}>
                    <Search size={14} />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher dans la transcription" />
                  </label>
                  <Segmented value={paragraphs ? 'p' : 'l'} onChange={(v) => setParagraphs(v === 'p')} options={[{ id: 'l', label: 'Lignes' }, { id: 'p', label: 'Paragraphes' }]} />
                  <button className="btn btn-ghost btn-sm" onClick={() => void window.kit.clipboard.write(current.lines.map((l) => l.text).join(' ')).then(() => toast('Texte copié (sans horodatage)', 'success'))}>
                    <Copy size={13} /> Texte seul
                  </button>
                </div>
                {q && <div className="faint small">{lines.length} passage{lines.length > 1 ? 's' : ''}</div>}
                {paragraphs && !q
                  ? paras.map((p, i) => (
                      <div key={i}>
                        {p.chapter && <h3 className="chapter">{p.chapter}</h3>}
                        <div className="line para-line">
                          <button className="time" onClick={() => void window.kit.openExternal(`https://youtu.be/${current.id}?t=${Math.floor(p.t)}`)}>
                            {clock(p.t)}
                          </button>
                          <span>{p.text}</span>
                        </div>
                      </div>
                    ))
                  : lines.map((l, i) => (
                      <div key={i} className="line">
                        <button className="time" onClick={() => void window.kit.openExternal(`https://youtu.be/${current.id}?t=${Math.floor(l.t)}`)} title="Ouvrir la vidéo à ce moment">
                          {clock(l.t)}
                        </button>
                        <span>{l.text}</span>
                        <button
                          className="btn btn-ghost btn-sm btn-icon add-note"
                          title="Ajouter une note à ce moment"
                          onClick={() => {
                            patch(current.id, { notes: [...(current.notes ?? []), { id: uid(), t: l.t, text: '' }].sort((a, b) => a.t - b.t) })
                            setTab('notes')
                          }}
                        >
                          <NotebookPen size={12} />
                        </button>
                      </div>
                    ))}
              </section>
            )}

            {tab === 'notes' && <NotesTab item={current} onChange={(notes) => patch(current.id, { notes })} />}
          </div>
        </div>
      )}

      {optsOpen && (
        <Modal
          title="Options du résumé"
          onClose={() => setOptsOpen(false)}
          footer={
            <button
              className="btn btn-primary"
              onClick={() => {
                setOptsOpen(false)
                if (current) void runAnalyze(current)
              }}
              disabled={!current || !!busy}
            >
              <Sparkles size={14} /> Résumer avec ces options
            </button>
          }
        >
          <div className="ui-col">
            <div className="field">
              <span className="field-label">Format</span>
              <Segmented
                value={opts.style}
                onChange={(style) => setOpts({ ...opts, style })}
                options={[
                  { id: 'summary', label: 'Résumé' },
                  { id: 'revision', label: 'Fiche de révision' },
                  { id: 'outline', label: 'Plan de cours' },
                  { id: 'tweet', label: 'Très court' }
                ]}
              />
            </div>
            <div className="field">
              <span className="field-label">Longueur</span>
              <Segmented value={opts.length} onChange={(length) => setOpts({ ...opts, length })} options={[{ id: 'short', label: 'Court' }, { id: 'normal', label: 'Normal' }, { id: 'long', label: 'Détaillé' }]} />
            </div>
            <div className="field">
              <span className="field-label">Langue</span>
              <Segmented value={opts.lang} onChange={(lang) => setOpts({ ...opts, lang })} options={[{ id: 'fr', label: 'Français' }, { id: 'en', label: 'Anglais' }]} />
            </div>
          </div>
        </Modal>
      )}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <Toasts />
    </Layout>
  )
}

function AskTab({ item, onChange }: { item: HistoryItem; onChange: (qa: QA[]) => void }): JSX.Element {
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const qa = item.qa ?? []
  const send = async (text = question): Promise<void> => {
    if (!text.trim() || busy) return
    setBusy(true)
    setQuestion('')
    try {
      const a = await window.kit.invoke<string>('yt:ask', item.title, item.lines, text.trim(), qa)
      onChange([...qa, { q: text.trim(), a, at: Date.now() }])
      setTimeout(() => end.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    } catch (err) {
      toast(errorText(err), 'error')
      setQuestion(text)
    } finally {
      setBusy(false)
    }
  }
  const SUGGEST = ['Quelle est l’idée principale ?', 'Explique-moi le passage le plus difficile simplement.', 'Quels exemples sont donnés ?', 'Qu’est-ce que je dois retenir pour un examen ?']
  return (
    <div className="ui-col">
      {!qa.length && (
        <div className="suggest">
          {SUGGEST.map((s) => (
            <button key={s} className="chip" onClick={() => void send(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
      )}
      {qa.map((x, i) => (
        <div key={i} className="qa">
          <div className="qa-q">{x.q}</div>
          <div className="qa-a">
            <Timed text={x.a} id={item.id} />
          </div>
        </div>
      ))}
      {busy && (
        <div className="qa">
          <div className="qa-a faint">
            <span className="spinner" /> L’IA cherche dans la vidéo…
          </div>
        </div>
      )}
      <div ref={end} />
      <div className="ask-bar">
        <input className="input" value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void send()} placeholder="Pose une question sur la vidéo…" disabled={busy} />
        <button className="btn btn-primary" onClick={() => void send()} disabled={busy || !question.trim()}>
          <Send size={14} />
        </button>
        {qa.length > 0 && (
          <button className="btn btn-ghost btn-icon" onClick={() => onChange([])} title="Effacer la discussion">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

function QuizTab({ item, onChange }: { item: HistoryItem; onChange: (q: QuizQuestion[]) => void }): JSX.Element {
  const [answers, setAnswers] = useState<(number | null)[]>([])
  const [busy, setBusy] = useState(false)
  const [count, setCount] = useState(8)
  const quiz = item.quiz ?? []
  useEffect(() => setAnswers(quiz.map(() => null)), [item.id, quiz.length])
  const make = async (): Promise<void> => {
    setBusy(true)
    try {
      onChange(await window.kit.invoke<QuizQuestion[]>('yt:quiz', item.title, item.lines, count))
    } catch (err) {
      toast(errorText(err), 'error')
    } finally {
      setBusy(false)
    }
  }
  const done = answers.filter((a) => a !== null).length
  const score = answers.filter((a, i) => a !== null && a === quiz[i]?.answer).length
  if (!quiz.length)
    return (
      <Empty
        icon={<GraduationCap size={22} />}
        title="Teste ce que tu as retenu"
        action={
          <div className="ui-row">
            <select className="select" value={count} onChange={(e) => setCount(Number(e.target.value))} style={{ width: 'auto' }}>
              {[5, 8, 10, 15].map((n) => (
                <option key={n} value={n}>
                  {n} questions
                </option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={() => void make()} disabled={busy}>
              {busy ? <span className="spinner" /> : <GraduationCap size={14} />} Créer le quiz
            </button>
          </div>
        }
      >
        L’IA prépare un QCM sur la vidéo. Tu réponds, elle corrige et explique.
      </Empty>
    )
  return (
    <div className="ui-col">
      <div className="quiz-head">
        <b>
          {done === quiz.length ? `Score : ${score} / ${quiz.length} ${score === quiz.length ? '🎉' : score >= quiz.length / 2 ? '👍' : '📚'}` : `${done} / ${quiz.length} répondues`}
        </b>
        <div className="ui-row">
          <button className="btn btn-ghost btn-sm" onClick={() => setAnswers(quiz.map(() => null))}>
            <RotateCcw size={13} /> Recommencer
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => void make()} disabled={busy}>
            {busy ? <span className="spinner" /> : <Sparkles size={13} />} Nouveau quiz
          </button>
        </div>
      </div>
      {quiz.map((x, i) => {
        const a = answers[i]
        return (
          <section key={i} className="ui-card quiz-q">
            <b>
              {i + 1}. {x.q}
            </b>
            <div className="choices">
              {x.choices.map((c, j) => (
                <button
                  key={j}
                  className={`choice${a !== null && j === x.answer ? ' good' : ''}${a === j && j !== x.answer ? ' bad' : ''}`}
                  disabled={a !== null}
                  onClick={() => setAnswers(answers.map((v, k) => (k === i ? j : v)))}
                >
                  {a !== null && j === x.answer ? <Check size={14} /> : a === j ? <X size={14} /> : <span className="letter">{'ABCDEF'[j]}</span>}
                  {c}
                </button>
              ))}
            </div>
            {a !== null && x.why && <p className="faint why">{x.why}</p>}
          </section>
        )
      })}
    </div>
  )
}

function CardsTab({ cards, known, onKnown }: { cards: { q: string; a: string }[]; known: number[]; onKnown: (k: number[]) => void }): JSX.Element {
  const [mode, setMode] = useState<'grid' | 'study'>('grid')
  const [order, setOrder] = useState<number[]>(() => cards.map((_, i) => i))
  const [pos, setPos] = useState(0)
  const [flip, setFlip] = useState(false)
  const toStudy = order.filter((i) => !known.includes(i))
  const startStudy = (shuffle: boolean): void => {
    const idx = cards.map((_, i) => i)
    if (shuffle) idx.sort(() => Math.random() - 0.5)
    setOrder(idx)
    setPos(0)
    setFlip(false)
    setMode('study')
  }
  const answer = (ok: boolean): void => {
    const i = toStudy[pos]
    if (ok) onKnown([...known, i])
    setFlip(false)
    if (!ok) setPos((p) => (p + 1 < toStudy.length ? p + 1 : 0))
  }
  return (
    <div className="ui-col">
      <div className="quiz-head">
        <span className="faint">
          {known.length} / {cards.length} sues
        </span>
        <div className="ui-row">
          {mode === 'study' ? (
            <button className="btn btn-ghost btn-sm" onClick={() => setMode('grid')}>
              Voir toutes les cartes
            </button>
          ) : (
            <>
              <button className="btn btn-primary btn-sm" onClick={() => startStudy(false)}>
                <GraduationCap size={13} /> Réviser
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => startStudy(true)}>
                <Shuffle size={13} /> Dans le désordre
              </button>
            </>
          )}
          {known.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => onKnown([])}>
              <RotateCcw size={13} /> Tout remettre à revoir
            </button>
          )}
        </div>
      </div>
      {mode === 'grid' ? (
        <div className="cards">
          {cards.map((c, i) => (
            <FlipCard key={i} q={c.q} a={c.a} known={known.includes(i)} />
          ))}
        </div>
      ) : toStudy.length ? (
        <div className="study">
          <div className="faint small">
            Carte {Math.min(pos + 1, toStudy.length)} / {toStudy.length} à revoir
          </div>
          <button className={`flip big${flip ? ' on' : ''}`} onClick={() => setFlip(!flip)}>
            <span className="flip-inner">
              <span className="flip-face front">
                <span className="faint small">Question</span>
                {cards[toStudy[pos]]?.q}
              </span>
              <span className="flip-face back">
                <span className="faint small">Réponse</span>
                {cards[toStudy[pos]]?.a}
              </span>
            </span>
          </button>
          {flip ? (
            <div className="ui-row study-btns">
              <button className="btn btn-secondary" onClick={() => answer(false)}>
                <X size={14} /> À revoir
              </button>
              <button className="btn btn-primary" onClick={() => answer(true)}>
                <Check size={14} /> Je savais
              </button>
            </div>
          ) : (
            <p className="faint">Clique sur la carte pour voir la réponse.</p>
          )}
        </div>
      ) : (
        <Empty icon={<Check size={22} />} title="Tout est su ! 🎉" action={<button className="btn btn-secondary" onClick={() => onKnown([])}>Recommencer</button>}>
          Toutes les cartes sont marquées comme sues.
        </Empty>
      )}
    </div>
  )
}

function NotesTab({ item, onChange }: { item: HistoryItem; onChange: (n: HistoryItem['notes']) => void }): JSX.Element {
  const notes = item.notes ?? []
  const [t, setT] = useState('')
  const parse = (s: string): number => s.split(':').reduce((a, n) => a * 60 + (Number(n) || 0), 0)
  return (
    <div className="ui-col">
      <p className="faint small">Ajoute une note au moment précis de la vidéo (ou depuis la transcription, avec l’icône à droite de chaque ligne).</p>
      {notes.map((n, i) => (
        <div key={n.id} className="note-row">
          <button className="time" onClick={() => void window.kit.openExternal(`https://youtu.be/${item.id}?t=${Math.floor(n.t)}`)}>
            {clock(n.t)}
          </button>
          <textarea
            className="textarea"
            rows={2}
            value={n.text}
            autoFocus={!n.text}
            placeholder="Ta note…"
            onChange={(e) => onChange(notes.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
          />
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => onChange(notes.filter((_, j) => j !== i))}>
            <X size={13} />
          </button>
        </div>
      ))}
      <div className="ui-row">
        <input className="input" style={{ width: 110 }} placeholder="m:ss" value={t} onChange={(e) => setT(e.target.value)} />
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => {
            onChange([...notes, { id: uid(), t: parse(t), text: '' }].sort((a, b) => a.t - b.t))
            setT('')
          }}
        >
          <NotebookPen size={13} /> Ajouter une note
        </button>
      </div>
    </div>
  )
}

function FlipCard({ q, a, known }: { q: string; a: string; known?: boolean }): JSX.Element {
  const [flip, setFlip] = useState(false)
  return (
    <button className={`flip${flip ? ' on' : ''}${known ? ' known' : ''}`} onClick={() => setFlip(!flip)}>
      <span className="flip-inner">
        <span className="flip-face front">
          <span className="faint small">Question {known && '· ✓ sue'}</span>
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
