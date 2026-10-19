import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Bell, ChevronLeft, File, Folder, FolderOpen, HardDrive, Play, Square } from 'lucide-react'
import { Page, Progress, Segmented, Switch, errorText, formatBytes, formatTime, toast } from '@ui'
import type { AlertSettings, HistoryPoint, ScanResult, SystemInfo, Volume } from '../../shared/types'
import { C, Chart } from './chart'

// ─── Historique ────────────────────────────────────────────────────────────────────────────

type Range = '15m' | '1h' | '6h'
const RANGE_MS: Record<Range, number> = { '15m': 15 * 60_000, '1h': 3600_000, '6h': 6 * 3600_000 }

function useHistory(): HistoryPoint[] {
  const [h, setH] = useState<HistoryPoint[]>([])
  useEffect(() => {
    const load = (): void => void window.kit.invoke<HistoryPoint[]>('monitor:history').then(setH)
    load()
    const t = setInterval(load, 10_000)
    return () => clearInterval(t)
  }, [])
  return h
}

/**
 * Ramène l'historique sur une grille régulière : une case = 10 s (15 min), 30 s (1 h) ou 3 min (6 h).
 * Une case sans mesure (PC en veille, module fermé…) reste vide : un trou, pas une valeur inventée.
 */
function bucket(h: HistoryPoint[], range: Range, key: keyof Omit<HistoryPoint, 'at'>): { values: (number | null)[]; len: number } {
  const span = RANGE_MS[range]
  const step = range === '15m' ? 10_000 : range === '1h' ? 30_000 : 180_000
  const len = Math.round(span / step)
  const now = Date.now()
  const sums = new Array<number>(len).fill(0)
  const counts = new Array<number>(len).fill(0)
  for (const p of h) {
    const i = len - 1 - Math.floor((now - p.at) / step)
    const v = p[key]
    if (i < 0 || i >= len || v == null) continue
    sums[i] += v
    counts[i]++
  }
  return { values: sums.map((s, i) => (counts[i] ? s / counts[i] : null)), len }
}

function stats(values: (number | null)[]): { avg: number | null; max: number | null } {
  const v = values.filter((x): x is number => x != null)
  return v.length ? { avg: v.reduce((a, b) => a + b, 0) / v.length, max: Math.max(...v) } : { avg: null, max: null }
}

export function HistoryView(): JSX.Element {
  const h = useHistory()
  const [range, setRange] = useState<Range>('15m')
  const cpu = bucket(h, range, 'cpu')
  const mem = bucket(h, range, 'mem')
  const rx = bucket(h, range, 'netRx')
  const tx = bucket(h, range, 'netTx')
  const temp = bucket(h, range, 'temp')
  const since = h[0]?.at
  const card = (title: string, color: string, series: { values: (number | null)[]; len: number }[], unit: (v: number) => string, max?: number, colors?: string[]): JSX.Element => {
    const s = stats(series[0].values)
    return (
      <section className="ui-card perf">
        <div className="perf-head">
          <b>{title}</b>
          <span className="spacer" />
          <span className="faint">
            moyenne <b style={{ color }}>{s.avg == null ? '—' : unit(s.avg)}</b> · pic <b style={{ color }}>{s.max == null ? '—' : unit(s.max)}</b>
          </span>
        </div>
        <Chart series={series.map((x) => x.values)} length={series[0].len} max={max} colors={colors ?? [color]} height={110} />
      </section>
    )
  }
  return (
    <Page
      title="Historique"
      sub={since ? `Mesuré toutes les 10 s depuis ${formatTime(since)}, gardé 6 h tant qu’Open Studio est ouvert.` : 'Les premières mesures arrivent…'}
      tools={<Segmented value={range} onChange={setRange} options={[{ id: '15m', label: '15 min' }, { id: '1h', label: '1 h' }, { id: '6h', label: '6 h' }]} />}
    >
      <div className="ui-col">
        {card('Processeur', C.cpu, [cpu], (v) => `${v.toFixed(0)} %`, 100)}
        {card('Mémoire', C.mem, [mem], (v) => `${v.toFixed(0)} %`, 100)}
        {card('Réseau (réception / envoi)', C.net, [rx, tx], (v) => `${formatBytes(v)}/s`, undefined, [C.net, C.netTx])}
        {stats(temp.values).max != null && card('Température du processeur', C.gpu, [temp], (v) => `${v.toFixed(0)} °C`)}
      </div>
    </Page>
  )
}

// ─── Alertes ───────────────────────────────────────────────────────────────────────────────

export function AlertsView(): JSX.Element {
  const [a, setA] = useState<AlertSettings | null>(null)
  useEffect(() => void window.kit.invoke<AlertSettings>('monitor:alerts').then(setA), [])
  const patch = (p: Partial<AlertSettings>): void => {
    setA((x) => (x ? { ...x, ...p } : x))
    void window.kit.invoke<AlertSettings>('monitor:setAlerts', p)
  }
  if (!a) return <Page title="Alertes">Chargement…</Page>
  const row = (label: string, hint: string, key: keyof Omit<AlertSettings, 'enabled'>, min: number, max: number, unit: string): JSX.Element => (
    <div className="alert-row">
      <div>
        <b>{label}</b>
        <div className="faint">{hint}</div>
      </div>
      <input type="range" min={min} max={max} value={a[key]} disabled={!a.enabled} onChange={(e) => patch({ [key]: Number(e.target.value) })} />
      <span className="alert-val">
        {a[key]} {unit}
      </span>
    </div>
  )
  return (
    <Page title="Alertes" sub="Une notification quand quelque chose cloche, même si le Moniteur est fermé (pas plus d’une par demi-heure et par sujet).">
      <div className="ui-card alert-card">
        <div className="alert-row">
          <div>
            <b>
              <Bell size={14} /> Activer les alertes
            </b>
            <div className="faint">Vérification toutes les 10 secondes, en arrière-plan.</div>
          </div>
          <span />
          <Switch on={a.enabled} onChange={(v) => patch({ enabled: v })} />
        </div>
        {row('Processeur saturé', 'Au-dessus de ce seuil…', 'cpu', 50, 100, '%')}
        {row('…pendant', 'Évite les fausses alertes quand un programme démarre.', 'cpuMinutes', 1, 30, 'min')}
        {row('Mémoire presque pleine', 'Part de la mémoire utilisée.', 'mem', 60, 99, '%')}
        {row('Processeur trop chaud', 'Si la température est mesurable.', 'temp', 60, 105, '°C')}
        {row('Disque presque plein', 'Espace libre minimum, vérifié toutes les 10 min.', 'diskFree', 2, 30, '% libres')}
        {row('Batterie faible', 'Hors charge uniquement.', 'battery', 5, 50, '%')}
      </div>
    </Page>
  )
}

// ─── Qu'est-ce qui prend de la place ? ─────────────────────────────────────────────────────

export function SpaceView(): JSX.Element {
  const [vols, setVols] = useState<Volume[]>([])
  const [stack, setStack] = useState<ScanResult[]>([])
  const [busy, setBusy] = useState<{ files: number; path: string } | null>(null)
  const [tab, setTab] = useState<'folders' | 'files'>('folders')
  useEffect(() => void window.kit.invoke<Volume[]>('monitor:volumes').then(setVols), [])
  useEffect(() => window.kit.on('monitor:scanProgress', (p: { files: number; path: string }) => setBusy(p)), [])
  const cur = stack[stack.length - 1]

  const scan = async (dir: string, push = true): Promise<void> => {
    setBusy({ files: 0, path: dir })
    window.studio?.setBusy?.(true)
    try {
      const r = await window.kit.invoke<ScanResult>('monitor:scan', dir)
      setStack((s) => (push ? [...s, r] : [r]))
    } catch (e) {
      if (!errorText(e).includes('annulé')) toast(errorText(e), 'error')
    } finally {
      setBusy(null)
      window.studio?.setBusy?.(false)
    }
  }
  const pick = async (): Promise<void> => {
    const [dir] = await window.kit.files.open({ directory: true, title: 'Dossier à analyser' })
    if (dir) void scan(dir, false)
  }

  return (
    <Page
      title="Qu’est-ce qui prend de la place ?"
      sub="Analyse un disque ou un dossier et classe ce qui pèse le plus. Rien n’est supprimé : tu ouvres l’emplacement et tu décides."
      tools={
        <button className="btn btn-secondary" onClick={() => void pick()} disabled={!!busy}>
          <FolderOpen size={14} /> Choisir un dossier
        </button>
      }
    >
      {!cur && !busy && (
        <div className="space-vols">
          {vols.map((v) => (
            <button key={v.mount} className="ui-card space-vol" onClick={() => void scan(v.mount, false)}>
              <HardDrive size={22} />
              <div>
                <b>{v.label}</b>
                <div className="faint">
                  {formatBytes(v.size - v.used)} libres sur {formatBytes(v.size)}
                </div>
                <div className="vol-bar">
                  <div style={{ width: `${(v.used / v.size) * 100}%`, background: C.disk }} />
                </div>
              </div>
            </button>
          ))}
          <p className="faint">Un disque entier peut prendre une minute ou deux. Les dossiers protégés par Windows sont ignorés.</p>
        </div>
      )}
      {busy && (
        <div className="ui-card scan-busy">
          <b>Analyse en cours… {busy.files.toLocaleString('fr-FR')} fichiers</b>
          <div className="faint mono ellipsis">{busy.path}</div>
          <button className="btn btn-secondary" onClick={() => void window.kit.invoke('monitor:cancelScan')}>
            <Square size={13} /> Arrêter
          </button>
        </div>
      )}
      {cur && !busy && (
        <>
          <div className="scan-head">
            {stack.length > 1 && (
              <button className="btn btn-ghost" onClick={() => setStack((s) => s.slice(0, -1))}>
                <ChevronLeft size={14} /> Retour
              </button>
            )}
            <b className="mono ellipsis">{cur.root}</b>
            <span className="faint">
              {formatBytes(cur.size)} · {cur.files.toLocaleString('fr-FR')} fichiers · {(cur.ms / 1000).toFixed(1)} s
            </span>
            <span className="spacer" />
            <button className="btn btn-ghost" onClick={() => void window.kit.files.openPath(cur.root)}>
              <FolderOpen size={14} /> Ouvrir
            </button>
            <button className="btn btn-ghost" onClick={() => setStack([])}>
              Autre disque
            </button>
          </div>
          {cur.truncated && <p className="faint">Très gros dossier : analyse arrêtée après 400 000 fichiers, les tailles sont donc un minimum.</p>}
          <Segmented value={tab} onChange={setTab} options={[{ id: 'folders', label: 'Contenu' }, { id: 'files', label: '40 plus gros fichiers' }]} />
          <div className="ui-card space-list">
            {(tab === 'folders' ? cur.children : cur.largest).slice(0, 200).map((e) => (
              <div key={e.path} className="space-row" onDoubleClick={() => e.dir && void scan(e.path)}>
                {e.dir ? <Folder size={15} className="ico-dir" /> : <File size={15} className="faint" />}
                <div className="space-name">
                  <span className="ellipsis" title={e.path}>
                    {tab === 'files' ? e.path : e.name}
                  </span>
                  <div className="space-bar">
                    <div style={{ width: `${cur.size ? (e.size / (tab === 'files' ? cur.largest[0]?.size || 1 : cur.size)) * 100 : 0}%` }} />
                  </div>
                </div>
                <span className="num">{formatBytes(e.size)}</span>
                <span className="faint num">{cur.size ? `${((e.size / cur.size) * 100).toFixed(1)} %` : ''}</span>
                <span className="space-actions">
                  {e.dir && (
                    <button className="btn btn-ghost btn-sm" onClick={() => void scan(e.path)} title="Analyser ce dossier">
                      Détailler
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => void window.kit.files.reveal(e.path)} title="Afficher dans l’explorateur">
                    <FolderOpen size={13} />
                  </button>
                </span>
              </div>
            ))}
            {!cur.children.length && <div className="faint" style={{ padding: 12 }}>Dossier vide (ou illisible).</div>}
          </div>
        </>
      )}
    </Page>
  )
}

// ─── Test de débit ─────────────────────────────────────────────────────────────────────────

interface SpeedResult {
  ping: number
  jitter: number
  down: number
  up: number
  server: string
  at?: number
}
const mbps = (bps: number | undefined): string => (bps == null ? '—' : `${(bps / 1e6).toFixed(bps < 1e7 ? 1 : 0)} Mb/s`)

export function SpeedView(): JSX.Element {
  const [live, setLive] = useState<{ phase: string; ping?: number; down?: number } | null>(null)
  const [past, setPast] = useState<SpeedResult[]>([])
  useEffect(() => void window.kit.store.get<SpeedResult[]>('speedtests', []).then(setPast), [])
  useEffect(() => window.kit.on('monitor:speedProgress', setLive), [])
  const last = past[0]
  const run = async (): Promise<void> => {
    setLive({ phase: 'ping' })
    try {
      const r = await window.kit.invoke<SpeedResult>('monitor:speedtest')
      const next = [{ ...r, at: Date.now() }, ...past].slice(0, 30)
      setPast(next)
      void window.kit.store.set('speedtests', next)
    } catch (e) {
      toast(`Test impossible : ${errorText(e)}`, 'error')
    } finally {
      setLive(null)
    }
  }
  const verdict = (r: SpeedResult): string =>
    r.down > 100e6 ? 'Très rapide : vidéo 4K, jeux en ligne et gros téléchargements sans souci.' : r.down > 25e6 ? 'Correct : vidéo HD et visio passent bien.' : r.down > 5e6 ? 'Moyen : la vidéo HD peut saccader à plusieurs.' : 'Lent : rapproche-toi de la box ou essaie un câble.'
  return (
    <Page title="Test de débit" sub="Mesure la vitesse de ta connexion Internet (environ 40 Mo téléchargés, 15 Mo envoyés).">
      <div className="ui-card speed">
        <div className="speed-gauges">
          <div>
            <span className="faint">Latence</span>
            <b>{live?.ping != null ? `${live.ping.toFixed(0)} ms` : last && !live ? `${last.ping.toFixed(0)} ms` : '—'}</b>
          </div>
          <div>
            <span className="faint">
              <ArrowDown size={13} /> Réception
            </span>
            <b style={{ color: C.net }}>{live ? mbps(live.down) : mbps(last?.down)}</b>
          </div>
          <div>
            <span className="faint">
              <ArrowUp size={13} /> Envoi
            </span>
            <b style={{ color: C.netTx }}>{live ? (live.phase === 'up' ? '…' : '—') : mbps(last?.up)}</b>
          </div>
        </div>
        {live ? (
          <>
            <Progress ratio={live.phase === 'ping' ? 0.1 : live.phase === 'down' ? 0.5 : 0.85} />
            <span className="faint">{live.phase === 'ping' ? 'Mesure de la latence…' : live.phase === 'down' ? 'Téléchargement…' : 'Envoi…'}</span>
          </>
        ) : (
          <button className="btn btn-primary" onClick={() => void run()}>
            <Play size={14} /> {last ? 'Relancer le test' : 'Lancer le test'}
          </button>
        )}
        {last && !live && <p>{verdict(last)}</p>}
        <p className="faint">Serveur : speed.cloudflare.com. Ferme les téléchargements en cours pour une mesure juste.</p>
      </div>
      {past.length > 0 && (
        <>
          <h2 className="ui-section-title">Tests précédents</h2>
          <div className="ui-card">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="num">Latence</th>
                  <th className="num">Réception</th>
                  <th className="num">Envoi</th>
                </tr>
              </thead>
              <tbody>
                {past.map((r, i) => (
                  <tr key={i}>
                    <td>{r.at ? new Date(r.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                    <td className="num">{r.ping.toFixed(0)} ms</td>
                    <td className="num">{mbps(r.down)}</td>
                    <td className="num">{mbps(r.up)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Page>
  )
}

// ─── Rapport système ───────────────────────────────────────────────────────────────────────

export function systemReport(info: SystemInfo, vols: Volume[]): string {
  const up = info.uptime
  const lines = [
    `# Rapport système — ${info.host}`,
    `Généré le ${new Date().toLocaleString('fr-FR')} par Open Studio · Moniteur`,
    '',
    `- Système : ${info.os} ${info.osVersion} (${info.arch})`,
    `- Appareil : ${[info.manufacturer, info.model].filter(Boolean).join(' ') || '—'}`,
    `- Processeur : ${info.cpuBrand} — ${info.cpuPhysical} cœurs physiques, ${info.cpuCores} logiques${info.cpuSpeed ? `, ${info.cpuSpeed} GHz` : ''}`,
    `- Mémoire : ${formatBytes(info.memTotal)}`,
    `- Cartes graphiques : ${info.gpus.map((g) => `${g.model}${g.vram ? ` (${formatBytes(g.vram)})` : ''}`).join(', ') || '—'}`,
    `- Allumé depuis : ${Math.floor(up / 86400)} j ${Math.floor((up % 86400) / 3600)} h`,
    '',
    '## Disques',
    ...info.disks.map((d) => `- ${d.name} — ${d.type}, ${d.interface}, ${formatBytes(d.size)}`),
    ...vols.map((v) => `- ${v.label} (${v.fs}) : ${formatBytes(v.size - v.used)} libres sur ${formatBytes(v.size)}`),
    '',
    '## Réseau',
    ...info.network.map((n) => `- ${n.iface} : ${n.ip4 || '—'}${n.speed ? ` · ${n.speed} Mb/s` : ''}`)
  ]
  return lines.join('\n')
}

export function useVolumes(): Volume[] {
  const [v, setV] = useState<Volume[]>([])
  useEffect(() => void window.kit.invoke<Volume[]>('monitor:volumes').then(setV), [])
  return useMemo(() => v, [v])
}
