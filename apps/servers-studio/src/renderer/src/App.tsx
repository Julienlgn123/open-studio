import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ChevronDown, Code2, Cpu, Download, ExternalLink, FolderOpen, MemoryStick, Pencil, Play, Plus, RotateCw, Search, Server, Square, SquareTerminal, Trash2, Eraser, Wrench, X } from 'lucide-react'
import { Empty, Layout, Modal, SideTitle, Switch, Toasts, errorText, formatBytes, toast } from '@ui'
import type { Detected, LogLine, Project, RunState, Status } from '../../shared/types'
import './servers.css'

const STATUS: Record<Status, { label: string; cls: string }> = {
  running: { label: 'En marche', cls: 'success' },
  starting: { label: 'Démarrage…', cls: 'info' },
  stopped: { label: 'Arrêté', cls: '' },
  crashed: { label: 'Planté', cls: 'danger' },
  restarting: { label: 'Relance…', cls: 'warning' }
}

const since = (t: number | null): string => {
  if (!t) return ''
  const s = Math.floor((Date.now() - t) / 1000)
  return s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`
}

export default function App(): JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [states, setStates] = useState<Record<string, RunState>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const [logs, setLogs] = useState<Record<string, LogLine[]>>({})
  const [edit, setEdit] = useState<Partial<Project> | null>(null)
  const [portIssue, setPortIssue] = useState<{ id: string; message: string } | null>(null)
  const [, tick] = useState(0)

  useEffect(() => {
    window.kit.invoke<Project[]>('servers:projects').then((p) => {
      setProjects(p)
      if (p[0]) setActiveId(p[0].id)
    })
    window.kit.invoke<RunState[]>('servers:states').then((s) => setStates(Object.fromEntries(s.map((x) => [x.id, x]))))
    const offS = window.kit.on('servers:states', (s: RunState[]) => setStates((prev) => ({ ...prev, ...Object.fromEntries(s.map((x) => [x.id, x])) })))
    const offL = window.kit.on('servers:logs', (id: string, lines: LogLine[]) => setLogs((l) => ({ ...l, [id]: [...(l[id] ?? []), ...lines].slice(-3000) })))
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => {
      offS()
      offL()
      clearInterval(t)
    }
  }, [])

  useEffect(() => {
    if (activeId && !logs[activeId]) void window.kit.invoke<LogLine[]>('servers:logs', activeId).then((l) => setLogs((x) => ({ ...x, [activeId]: l })))
  }, [activeId])

  const act = async (channel: string, id: string): Promise<void> => {
    try {
      await window.kit.invoke(channel, id)
    } catch (err) {
      const msg = errorText(err)
      if (channel === 'servers:start' && /port/i.test(msg)) setPortIssue({ id, message: msg })
      else toast(msg, 'error')
    }
  }
  const groups = [...new Set(projects.map((p) => p.group ?? ''))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
  const isOn = (id: string): boolean => ['running', 'starting', 'restarting'].includes(states[id]?.status ?? 'stopped')

  const active = projects.find((p) => p.id === activeId) ?? null
  const running = Object.values(states).filter((s) => s.status === 'running' || s.status === 'starting' || s.status === 'restarting').length

  return (
    <Layout
      side={
        <>
          <SideTitle>Serveurs locaux</SideTitle>
          <button className="btn btn-primary btn-sm" onClick={() => setEdit({ autoRestart: true })}>
            <Plus size={14} /> Ajouter un projet
          </button>
          {groups.map((g) => {
            const list = projects.filter((p) => (p.group ?? '') === g)
            const anyOn = list.some((p) => isOn(p.id))
            return (
              <div key={g || '_'}>
                <div className="ui-side-section group-head">
                  <span>{g || (groups.length > 1 ? 'Autres' : running ? `${running} en marche` : 'Projets')}</span>
                  {g && (
                    <button
                      className="mini"
                      title={anyOn ? 'Arrêter le groupe' : 'Lancer tout le groupe'}
                      onClick={() => void window.kit.invoke(anyOn ? 'servers:stopGroup' : 'servers:startGroup', g)}
                    >
                      {anyOn ? <Square size={10} fill="currentColor" /> : <Play size={10} fill="currentColor" />}
                    </button>
                  )}
                </div>
                {list.map((p) => {
                  const st = states[p.id]?.status ?? 'stopped'
                  const u = states[p.id]?.usage
                  return (
                    <button key={p.id} className={`proj${p.id === activeId ? ' on' : ''}`} onClick={() => setActiveId(p.id)}>
                      <span className={`dot ${st}${states[p.id]?.healthy === false ? ' unhealthy' : ''}`} />
                      <span className="proj-name">{p.name}</span>
                      {u && isOn(p.id) && <span className="faint proj-cpu">{Math.round(u.cpu)} %</span>}
                      {isOn(p.id) ? (
                        <span
                          className="mini"
                          title="Arrêter"
                          onClick={(e) => {
                            e.stopPropagation()
                            void act('servers:stop', p.id)
                          }}
                        >
                          <Square size={11} fill="currentColor" />
                        </span>
                      ) : (
                        <span
                          className="mini"
                          title="Lancer"
                          onClick={(e) => {
                            e.stopPropagation()
                            void act('servers:start', p.id)
                          }}
                        >
                          <Play size={11} fill="currentColor" />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
          {running > 0 && (
            <div className="ui-side-foot">
              <button className="btn btn-ghost btn-sm" style={{ width: '100%' }} onClick={() => void window.kit.invoke('servers:stopAll')}>
                <Square size={11} fill="currentColor" /> Tout arrêter ({running})
              </button>
            </div>
          )}
        </>
      }
    >
      {active ? (
        <ProjectView
          project={active}
          state={states[active.id]}
          logs={logs[active.id] ?? []}
          onAct={(c) => void act(c, active.id)}
          onEdit={() => setEdit(active)}
          onTask={(cmd) =>
            void window.kit.invoke<number>('servers:task', active.id, cmd).then((code) => toast(code === 0 ? `« ${cmd} » terminé` : `« ${cmd} » a échoué (code ${code})`, code === 0 ? 'success' : 'error'))
          }
          onClear={() => {
            void window.kit.invoke('servers:clearLogs', active.id)
            setLogs((l) => ({ ...l, [active.id]: [] }))
          }}
        />
      ) : (
        <Empty icon={<Server size={24} />} title="Lance tes projets en un clic" action={<button className="btn btn-primary" onClick={() => setEdit({ autoRestart: true })}><Plus size={14} /> Ajouter un projet</button>}>
          Bots Discord, sites, API, scripts : choisis le dossier, la commande est trouvée toute seule. Logs en direct, relance si ça plante, démarrage avec Open Studio.
        </Empty>
      )}

      {portIssue && (
        <Modal
          title="Port déjà utilisé"
          onClose={() => setPortIssue(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setPortIssue(null)}>
                Annuler
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  void window.kit.invoke('servers:start', portIssue.id, true).catch((e) => toast(errorText(e), 'error'))
                  setPortIssue(null)
                }}
              >
                Lancer quand même
              </button>
            </>
          }
        >
          <p className="muted">{portIssue.message}</p>
        </Modal>
      )}
      {edit && (
        <EditModal
          project={edit}
          groups={groups.filter(Boolean)}
          onClose={() => setEdit(null)}
          onSave={async (p) => {
            const list = await window.kit.invoke<Project[]>('servers:save', p)
            setProjects(list)
            setActiveId(p.id ?? list[list.length - 1].id)
            setEdit(null)
          }}
          onDelete={
            edit.id
              ? async () => {
                  setProjects(await window.kit.invoke<Project[]>('servers:delete', edit.id))
                  setActiveId(null)
                  setEdit(null)
                }
              : undefined
          }
        />
      )}
      <Toasts />
    </Layout>
  )
}

/** Commandes ponctuelles proposées selon le projet (en plus de celles ajoutées par l'utilisateur). */
function presetTasks(p: Project): { label: string; command: string }[] {
  const out: { label: string; command: string }[] = []
  if (/\b(npm|node|npx|yarn|pnpm)\b/.test(p.command)) out.push({ label: 'Installer les dépendances', command: /yarn/.test(p.command) ? 'yarn' : /pnpm/.test(p.command) ? 'pnpm install' : 'npm install' })
  if (/\bpython\b/.test(p.command)) out.push({ label: 'Installer requirements.txt', command: 'pip install -r requirements.txt' })
  out.push({ label: 'Récupérer les mises à jour (git pull)', command: 'git pull' })
  return out
}
const linkify = (text: string): (string | JSX.Element)[] =>
  text.split(/(https?:\/\/[^\s'"]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} className="log-link" onClick={() => void window.kit.openExternal(part.replace('0.0.0.0', 'localhost'))}>
        {part}
      </a>
    ) : (
      part
    )
  )

function ProjectView({ project: p, state, logs, onAct, onEdit, onClear, onTask }: { project: Project; state?: RunState; logs: LogLine[]; onAct: (channel: string) => void; onEdit: () => void; onClear: () => void; onTask: (cmd: string) => void }): JSX.Element {
  const st = state?.status ?? 'stopped'
  const on = st === 'running' || st === 'starting' || st === 'restarting'
  const [q, setQ] = useState('')
  const [onlyErr, setOnlyErr] = useState(false)
  const [tasksOpen, setTasksOpen] = useState(false)
  const [times, setTimes] = useState(true)
  const tasks = [...(p.tasks ?? []), ...presetTasks(p).filter((x) => !(p.tasks ?? []).some((t) => t.command === x.command))]
  const exportLogs = async (): Promise<void> => {
    const path = await window.kit.files.save({ title: 'Enregistrer les logs', defaultPath: `${p.name.replace(/[\\/:*?"<>|]/g, '-')}-logs.txt`, filters: [{ name: 'Texte', extensions: ['txt', 'log'] }] })
    if (!path) return
    await window.kit.files.writeText(path, logs.map((l) => `[${new Date(l.t).toLocaleString('fr-FR')}]${l.err ? ' [ERR]' : ''} ${l.text}`).join('\n'))
    toast('Logs enregistrés', 'success')
  }
  const box = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const shown = useMemo(() => logs.filter((l) => (!onlyErr || l.err) && (!q || l.text.toLowerCase().includes(q.toLowerCase()))), [logs, q, onlyErr])
  useEffect(() => {
    if (stick.current) box.current?.scrollTo({ top: box.current.scrollHeight })
  }, [shown.length])
  return (
    <div className="proj-view">
      <div className="ui-toolbar">
        <b className="proj-title">{p.name}</b>
        <span className={`chip ${STATUS[st].cls}`}>{STATUS[st].label}</span>
        {on && state?.startedAt && <span className="faint">depuis {since(state.startedAt)}</span>}
        {(state?.restarts ?? 0) > 0 && <span className="chip warning">{state!.restarts} relance{state!.restarts > 1 ? 's' : ''}</span>}
        {on && state?.usage && (
          <>
            <span className="chip" title="Processeur (programme et ses sous-processus)">
              <Cpu size={11} /> {state.usage.cpu} %
            </span>
            <span className="chip" title={`${state.usage.procs} processus`}>
              <MemoryStick size={11} /> {formatBytes(state.usage.mem)}
            </span>
          </>
        )}
        {on && p.health && state?.healthy != null && (
          <span className={`chip ${state.healthy ? 'success' : 'danger'}`} title={p.health}>
            <Activity size={11} /> {state.healthy ? 'Répond' : 'Ne répond pas'}
          </span>
        )}
        {state?.task && (
          <span className="chip info">
            <span className="spinner" /> {state.task}
          </span>
        )}
        <div className="spacer" />
        {state?.url && (
          <button className="btn btn-secondary btn-sm" onClick={() => void window.kit.openExternal(state.url!)}>
            <ExternalLink size={13} /> {state.url.replace(/^https?:\/\//, '')}
          </button>
        )}
        {on ? (
          <>
            <button className="btn btn-secondary btn-sm" onClick={() => onAct('servers:restart')}>
              <RotateCw size={13} /> Relancer
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => onAct('servers:stop')}>
              <Square size={12} fill="currentColor" /> Arrêter
            </button>
          </>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={() => onAct('servers:start')}>
            <Play size={13} fill="currentColor" /> Lancer
          </button>
        )}
        <div className="menu-wrap">
          <button className="btn btn-ghost btn-sm" onClick={() => setTasksOpen(!tasksOpen)} title="Commandes ponctuelles">
            <Wrench size={13} /> <ChevronDown size={11} />
          </button>
          {tasksOpen && (
            <div className="menu" onMouseLeave={() => setTasksOpen(false)}>
              {tasks.map((t) => (
                <button
                  key={t.command}
                  disabled={!!state?.task}
                  onClick={() => {
                    setTasksOpen(false)
                    onTask(t.command)
                  }}
                >
                  <b>{t.label}</b>
                  <code>{t.command}</code>
                </button>
              ))}
              <hr />
              <button onClick={() => void window.kit.invoke('servers:openIn', p.id, 'code')}>
                <b>
                  <Code2 size={12} /> Ouvrir dans VS Code
                </b>
              </button>
              <button onClick={() => void window.kit.invoke('servers:openIn', p.id, 'terminal')}>
                <b>
                  <SquareTerminal size={12} /> Ouvrir un terminal ici
                </b>
              </button>
            </div>
          )}
        </div>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={onEdit} title="Modifier">
          <Pencil size={14} />
        </button>
      </div>
      <div className="proj-info">
        <code title={p.cwd}>
          <FolderOpen size={12} /> {p.cwd}
        </code>
        <code>$ {p.command}</code>
        {p.autoStart && <span className="chip accent">Démarre avec Open Studio</span>}
        {p.autoRestart && <span className="chip">Relance si plantage</span>}
        <button className="btn btn-ghost btn-sm" onClick={() => void window.kit.files.openPath(p.cwd)}>
          Ouvrir le dossier
        </button>
      </div>
      <div className="log-tools">
        <label className="search">
          <Search size={13} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer les logs" />
        </label>
        <label className="ui-row faint">
          <input type="checkbox" checked={onlyErr} onChange={(e) => setOnlyErr(e.target.checked)} /> Erreurs seulement
        </label>
        <div className="spacer" />
        <label className="ui-row faint">
          <input type="checkbox" checked={times} onChange={(e) => setTimes(e.target.checked)} /> Heures
        </label>
        <span className="faint">{logs.length} lignes</span>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => void exportLogs()} title="Enregistrer les logs">
          <Download size={13} />
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onClear}>
          <Eraser size={13} /> Effacer
        </button>
      </div>
      <div
        className="logs"
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
      >
        {shown.map((l, i) => (
          <div key={i} className={`log${l.err ? ' err' : ''}${l.text.startsWith('▶') || l.text.startsWith('■') || l.text.startsWith('↻') ? ' sys' : ''}`}>
            {times && <span className="log-t">{new Date(l.t).toLocaleTimeString('fr-FR')}</span>}
            <span>{linkify(l.text)}</span>
          </div>
        ))}
        {!shown.length && <div className="faint log-empty">{logs.length ? 'Aucune ligne ne correspond.' : 'Les logs apparaîtront ici au lancement.'}</div>}
      </div>
    </div>
  )
}

function EditModal({ project, groups, onClose, onSave, onDelete }: { project: Partial<Project>; groups: string[]; onClose: () => void; onSave: (p: Partial<Project>) => Promise<void>; onDelete?: () => Promise<void> }): JSX.Element {
  const [p, setP] = useState(project)
  const [det, setDet] = useState<Detected | null>(null)
  const pick = async (): Promise<void> => {
    const [dir] = await window.kit.files.open({ directory: true, title: 'Dossier du projet' })
    if (!dir) return
    const d = await window.kit.invoke<Detected>('servers:detect', dir)
    setDet(d)
    setP((x) => ({ ...x, cwd: dir, name: x.name || d.name, command: x.command || d.suggestions[0]?.command || '' }))
  }
  return (
    <Modal
      title={project.id ? 'Modifier le projet' : 'Ajouter un projet'}
      onClose={onClose}
      width={560}
      footer={
        <>
          {onDelete && (
            <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => void onDelete()}>
              <Trash2 size={14} /> Retirer
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" disabled={!p.cwd || !p.command?.trim() || !p.name?.trim()} onClick={() => void onSave(p)}>
            Enregistrer
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field-label">Dossier</label>
        <div className="ui-row">
          <input className="input mono" value={p.cwd ?? ''} onChange={(e) => setP({ ...p, cwd: e.target.value })} placeholder="C:\…\mon-bot" />
          <button className="btn btn-secondary" onClick={() => void pick()}>
            <FolderOpen size={14} /> Choisir
          </button>
        </div>
      </div>
      <div className="field">
        <label className="field-label">Nom</label>
        <input className="input" value={p.name ?? ''} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="Mon bot Discord" />
      </div>
      <div className="field">
        <label className="field-label">Commande de lancement</label>
        <input className="input mono" value={p.command ?? ''} onChange={(e) => setP({ ...p, command: e.target.value })} placeholder="npm run start · python bot.py · node index.js" />
        {det && det.suggestions.length > 0 && (
          <div className="sugg">
            {det.suggestions.map((s) => (
              <button key={s.command} className={`chip ${p.command === s.command ? 'accent' : ''}`} onClick={() => setP({ ...p, command: s.command })} title={s.label}>
                {s.command}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="ui-row two-fields">
        <div className="field">
          <label className="field-label">Groupe (facultatif)</label>
          <input className="input" list="groups" value={p.group ?? ''} onChange={(e) => setP({ ...p, group: e.target.value })} placeholder="Ex. Mon site (front + API)" />
          <datalist id="groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label className="field-label">Port (facultatif)</label>
          <input className="input mono" type="number" value={p.port ?? ''} onChange={(e) => setP({ ...p, port: e.target.value ? Number(e.target.value) : null })} placeholder="3000" />
        </div>
      </div>
      <div className="field">
        <label className="field-label">Adresse à surveiller (facultatif)</label>
        <input className="input mono" value={p.health ?? ''} onChange={(e) => setP({ ...p, health: e.target.value })} placeholder="http://localhost:3000/health" />
        {p.health && (
          <label className="ui-row faint" style={{ marginTop: 6 }}>
            <Switch on={!!p.healthRestart} onChange={(v) => setP({ ...p, healthRestart: v })} /> Relancer si elle ne répond plus pendant 1 minute
          </label>
        )}
      </div>
      <div className="field">
        <label className="field-label">Commandes ponctuelles (facultatif)</label>
        {(p.tasks ?? []).map((t, i) => (
          <div key={i} className="ui-row task-edit">
            <input className="input" value={t.label} onChange={(e) => setP({ ...p, tasks: p.tasks!.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} placeholder="Nom" />
            <input className="input mono" value={t.command} onChange={(e) => setP({ ...p, tasks: p.tasks!.map((x, j) => (j === i ? { ...x, command: e.target.value } : x)) })} placeholder="npm run build" />
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setP({ ...p, tasks: p.tasks!.filter((_, j) => j !== i) })}>
              <X size={12} />
            </button>
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setP({ ...p, tasks: [...(p.tasks ?? []), { label: '', command: '' }] })}>
          <Plus size={12} /> Ajouter une commande (build, migration, tests…)
        </button>
      </div>
      <div className="field">
        <label className="field-label">Variables d’environnement (facultatif)</label>
        <textarea className="textarea mono" rows={3} value={p.env ?? ''} onChange={(e) => setP({ ...p, env: e.target.value })} placeholder={'PORT=3000\nNODE_ENV=production'} />
        <span className="field-hint">Une par ligne. Un fichier .env dans le dossier reste lu par ton projet comme d’habitude.</span>
      </div>
      <div className="ui-row" style={{ justifyContent: 'space-between' }}>
        <span>Lancer avec Open Studio</span>
        <Switch on={!!p.autoStart} onChange={(v) => setP({ ...p, autoStart: v })} />
      </div>
      <div className="ui-row" style={{ justifyContent: 'space-between' }}>
        <span>Relancer automatiquement s’il plante</span>
        <Switch on={p.autoRestart ?? true} onChange={(v) => setP({ ...p, autoRestart: v })} />
      </div>
    </Modal>
  )
}
