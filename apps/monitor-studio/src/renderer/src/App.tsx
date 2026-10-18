import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowDown, ArrowUp, Cpu, Gauge, HardDrive, Info, ListTree, MemoryStick, Monitor, Network, Search, Thermometer, Zap } from 'lucide-react'
import { Layout, NavItem, Page, SideTitle, Toasts, formatBytes, useTheme } from '@ui'
import type { ProcessInfo, Sample, SystemInfo, Volume } from '../../shared/types'
import './monitor.css'

type View = 'summary' | 'perf' | 'processes' | 'disks' | 'system'
const HISTORY = 120 // 2 minutes à 1 mesure par seconde

const pct = (v: number | null | undefined, digits = 0): string => (v == null ? '—' : `${v.toFixed(digits)} %`)
const rate = (v: number | null): string => (v == null ? '—' : `${formatBytes(v)}/s`)
const NA = 'non disponible'

/** Mesures en continu, une par seconde, gardées 2 minutes. */
function useSamples(): Sample[] {
  const [list, setList] = useState<Sample[]>([])
  useEffect(() => {
    let alive = true
    let timer = 0
    const tick = async (): Promise<void> => {
      const t0 = Date.now()
      try {
        const s = await window.kit.invoke<Sample>('monitor:sample')
        if (alive) setList((l) => [...l, s].slice(-HISTORY))
      } catch {
        /* mesure manquée : un trou dans les courbes, pas une valeur inventée */
      }
      if (alive) timer = window.setTimeout(() => void tick(), Math.max(200, 1000 - (Date.now() - t0)))
    }
    void tick()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [])
  return list
}

export default function App(): JSX.Element {
  const [view, setView] = useState<View>('summary')
  const samples = useSamples()
  const [info, setInfo] = useState<SystemInfo | null>(null)
  useEffect(() => void window.kit.invoke<SystemInfo>('monitor:info').then(setInfo), [])
  const last = samples[samples.length - 1] ?? null

  return (
    <Layout
      side={
        <>
          <SideTitle>
            <Activity size={18} className="brand-ico" /> Moniteur
          </SideTitle>
          <NavItem icon={<Gauge size={15} />} label="Résumé" active={view === 'summary'} onClick={() => setView('summary')} />
          <NavItem icon={<Activity size={15} />} label="Performances" active={view === 'perf'} onClick={() => setView('perf')} />
          <NavItem icon={<ListTree size={15} />} label="Processus" active={view === 'processes'} onClick={() => setView('processes')} />
          <NavItem icon={<HardDrive size={15} />} label="Disques" active={view === 'disks'} onClick={() => setView('disks')} />
          <NavItem icon={<Info size={15} />} label="Système" active={view === 'system'} onClick={() => setView('system')} />
          <div className="ui-side-foot credit">
            <span className={`live${last ? ' on' : ''}`} /> {last ? 'Mesures en direct' : 'Connexion aux capteurs…'}
            <p>
              Lecture seule : rien n’est modifié sur ton PC. Inspiré de{' '}
              <button className="link" onClick={() => void window.kit.openExternal('https://tmog.org/')}>
                TMOG (tmog.org)
              </button>
              .
            </p>
          </div>
        </>
      }
    >
      {view === 'summary' && <Summary samples={samples} info={info} />}
      {view === 'perf' && <Performance samples={samples} info={info} />}
      {view === 'processes' && <Processes />}
      {view === 'disks' && <Disks info={info} />}
      {view === 'system' && <SystemView info={info} />}
      <Toasts />
    </Layout>
  )
}

// ─── Graphique ─────────────────────────────────────────────────────────────────────────────

/**
 * Courbe en direct. Une mesure manquante (null) laisse un trou : on ne trace jamais une ligne
 * à travers des données qu'on n'a pas.
 */
function Chart({ series, max, height = 120, colors }: { series: (number | null)[][]; max?: number; height?: number; colors: string[] }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const theme = useTheme()
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ratio = window.devicePixelRatio || 1
    const W = c.clientWidth
    const H = height
    c.width = W * ratio
    c.height = H * ratio
    const ctx = c.getContext('2d')!
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, W, H)
    const css = getComputedStyle(document.documentElement)
    ctx.strokeStyle = css.getPropertyValue('--border').trim()
    ctx.lineWidth = 1
    for (let i = 1; i < 4; i++) {
      ctx.beginPath()
      ctx.moveTo(0, (H / 4) * i)
      ctx.lineTo(W, (H / 4) * i)
      ctx.stroke()
    }
    const top = max ?? Math.max(1, ...series.flat().filter((v): v is number => v != null)) * 1.15
    const dx = W / (HISTORY - 1)
    series.forEach((s, si) => {
      const off = HISTORY - s.length
      const col = colors[si]
      const segment = (fill: boolean): void => {
        ctx.beginPath()
        let pen = false
        let startX = 0
        let lastX = 0
        const close = (): void => {
          if (fill && pen) {
            ctx.lineTo(lastX, H)
            ctx.lineTo(startX, H)
            ctx.closePath()
            ctx.fill()
            ctx.beginPath()
          }
        }
        s.forEach((v, i) => {
          const x = (off + i) * dx
          if (v == null) {
            close()
            pen = false
            return
          }
          const y = H - (Math.min(v, top) / top) * (H - 2) - 1
          if (!pen) {
            ctx.moveTo(x, fill ? H : y)
            if (fill) ctx.lineTo(x, y)
            startX = x
          } else ctx.lineTo(x, y)
          pen = true
          lastX = x
        })
        if (fill) close()
        else ctx.stroke()
      }
      ctx.fillStyle = `${col}22`
      segment(true)
      ctx.strokeStyle = col
      ctx.lineWidth = 1.8
      segment(false)
    })
  }, [series, max, height, colors, theme])
  return <canvas ref={ref} className="chart" style={{ height }} />
}

function Meter({ value, color }: { value: number | null; color: string }): JSX.Element {
  return (
    <div className="meter">
      <div style={{ width: `${Math.min(100, value ?? 0)}%`, background: color, opacity: value == null ? 0 : 1 }} />
    </div>
  )
}

const C = { cpu: '#22d3ee', mem: '#a78bfa', disk: '#fbbf24', net: '#34d399', netTx: '#f472b6', gpu: '#fb7185' }

// ─── Résumé ────────────────────────────────────────────────────────────────────────────────

function Summary({ samples, info }: { samples: Sample[]; info: SystemInfo | null }): JSX.Element {
  const s = samples[samples.length - 1]
  const [procs, setProcs] = useState<ProcessInfo[]>([])
  useEffect(() => {
    let alive = true
    const load = (): void => void window.kit.invoke<ProcessInfo[]>('monitor:processes').then((p) => alive && setProcs(p))
    load()
    const t = setInterval(load, 4000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])
  const memPct = s?.memUsed != null && s.memTotal ? (s.memUsed / s.memTotal) * 100 : null
  const topCpu = procs[0]
  const topMem = [...procs].sort((a, b) => b.mem - a.mem)[0]

  // « Pourquoi c'est lent ? » : le sous-système le plus chargé, et le programme responsable.
  const verdict = useMemo(() => {
    if (!s) return null
    if ((s.cpu ?? 0) > 80) return { level: 'hot', text: `Le processeur est saturé (${pct(s.cpu)}).`, who: topCpu ? `${topCpu.name} en utilise le plus (${topCpu.cpu.toFixed(0)} %).` : '' }
    if ((memPct ?? 0) > 88) return { level: 'hot', text: `La mémoire est presque pleine (${pct(memPct)}).`, who: topMem ? `${topMem.name} occupe ${formatBytes(topMem.mem)}.` : '' }
    if ((s.diskRead ?? 0) + (s.diskWrite ?? 0) > 150 * 1024 * 1024) return { level: 'warm', text: 'Le disque est très sollicité.', who: '' }
    if ((s.cpu ?? 0) > 50) return { level: 'warm', text: `Le processeur travaille (${pct(s.cpu)}).`, who: topCpu ? `Surtout ${topCpu.name}.` : '' }
    return { level: 'ok', text: 'Tout va bien : ton PC n’est pas surchargé.', who: topCpu && topCpu.cpu > 5 ? `Le plus actif : ${topCpu.name} (${topCpu.cpu.toFixed(0)} %).` : '' }
  }, [s, procs])

  const tiles: { icon: JSX.Element; label: string; value: string; sub: string; series: (number | null)[][]; max?: number; colors: string[] }[] = [
    { icon: <Cpu size={15} />, label: 'Processeur', value: pct(s?.cpu), sub: info ? `${info.cpuCores} cœurs` : '', series: [samples.map((x) => x.cpu)], max: 100, colors: [C.cpu] },
    {
      icon: <MemoryStick size={15} />,
      label: 'Mémoire',
      value: pct(memPct),
      sub: s?.memUsed != null && s.memTotal ? `${formatBytes(s.memUsed)} / ${formatBytes(s.memTotal)}` : NA,
      series: [samples.map((x) => (x.memUsed != null && x.memTotal ? (x.memUsed / x.memTotal) * 100 : null))],
      max: 100,
      colors: [C.mem]
    },
    { icon: <HardDrive size={15} />, label: 'Disque', value: rate(s?.diskRead != null && s.diskWrite != null ? s.diskRead + s.diskWrite : null), sub: s?.diskRead == null ? NA : `↓ ${rate(s.diskRead)} · ↑ ${rate(s.diskWrite)}`, series: [samples.map((x) => (x.diskRead != null && x.diskWrite != null ? x.diskRead + x.diskWrite : null))], colors: [C.disk] },
    { icon: <Network size={15} />, label: 'Réseau', value: rate(s?.netRx ?? null), sub: s?.netTx == null ? NA : `envoi ${rate(s.netTx)}`, series: [samples.map((x) => x.netRx), samples.map((x) => x.netTx)], colors: [C.net, C.netTx] },
    { icon: <Monitor size={15} />, label: 'Carte graphique', value: pct(s?.gpuLoad), sub: s?.gpuLoad == null ? `Utilisation ${NA}` : s.gpuMemUsed != null && s.gpuMemTotal ? `${formatBytes(s.gpuMemUsed)} / ${formatBytes(s.gpuMemTotal)}` : '', series: [samples.map((x) => x.gpuLoad)], max: 100, colors: [C.gpu] }
  ]

  return (
    <Page title="Résumé" sub="Pourquoi ton PC est lent ? Un coup d’œil suffit.">
      {verdict && (
        <div className={`verdict ${verdict.level}`}>
          <Zap size={18} />
          <div>
            <b>{verdict.text}</b> {verdict.who}
          </div>
        </div>
      )}
      <div className="tiles">
        {tiles.map((t) => (
          <div key={t.label} className="ui-card tile">
            <div className="tile-head">
              {t.icon} {t.label}
            </div>
            <div className="tile-value">{t.value}</div>
            <div className="faint tile-sub">{t.sub}</div>
            <Chart series={t.series} max={t.max} height={56} colors={t.colors} />
          </div>
        ))}
        <div className="ui-card tile">
          <div className="tile-head">
            <Thermometer size={15} /> Températures
          </div>
          <div className="temps">
            <div>
              <span className="faint">Processeur</span>
              <b>{s?.cpuTemp != null ? `${s.cpuTemp.toFixed(0)} °C` : '—'}</b>
            </div>
            <div>
              <span className="faint">Carte graphique</span>
              <b>{s?.gpuTemp != null ? `${s.gpuTemp.toFixed(0)} °C` : '—'}</b>
            </div>
            {s?.battery && (
              <div>
                <span className="faint">Batterie</span>
                <b>
                  {s.battery.percent} %{s.battery.charging ? ' ⚡' : ''}
                </b>
              </div>
            )}
          </div>
          {s && s.cpuTemp == null && <p className="faint tile-sub">Windows ne donne pas toujours la température : « — » veut dire non mesurée, pas zéro.</p>}
        </div>
      </div>

      <h2 className="ui-section-title">Ce qui consomme le plus</h2>
      <div className="ui-card">
        <table className="table">
          <thead>
            <tr>
              <th>Programme</th>
              <th className="num">Processeur</th>
              <th className="num">Mémoire</th>
            </tr>
          </thead>
          <tbody>
            {procs.slice(0, 8).map((p) => (
              <tr key={p.name}>
                <td>{p.name}</td>
                <td className="num">
                  <div className="cell-bar">
                    <Meter value={p.cpu} color={C.cpu} />
                    {p.cpu.toFixed(1)} %
                  </div>
                </td>
                <td className="num">{formatBytes(p.mem)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!procs.length && <div className="faint" style={{ padding: 10 }}>Lecture des processus…</div>}
      </div>
    </Page>
  )
}

// ─── Performances ──────────────────────────────────────────────────────────────────────────

function Performance({ samples, info }: { samples: Sample[]; info: SystemInfo | null }): JSX.Element {
  const s = samples[samples.length - 1]
  const cores = s?.cores.length ?? 0
  return (
    <Page title="Performances" sub="Les 2 dernières minutes, mesure par mesure.">
      <section className="ui-card perf">
        <div className="perf-head">
          <b>
            <Cpu size={15} /> Processeur
          </b>
          <span className="faint">{info?.cpuBrand}</span>
          <span className="perf-value" style={{ color: C.cpu }}>
            {pct(s?.cpu, 1)}
          </span>
        </div>
        <Chart series={[samples.map((x) => x.cpu)]} max={100} colors={[C.cpu]} />
        {info?.performanceCores && info.efficiencyCores ? (
          <p className="faint">
            {info.performanceCores} cœurs performance · {info.efficiencyCores} cœurs efficacité
          </p>
        ) : null}
        <div className="cores">
          {Array.from({ length: cores }, (_, i) => (
            <div key={i} className="core">
              <span className="faint">
                Cœur {i + 1} · {pct(s?.cores[i])}
              </span>
              <Chart series={[samples.map((x) => x.cores[i] ?? null)]} max={100} height={38} colors={[C.cpu]} />
            </div>
          ))}
        </div>
      </section>

      <div className="perf-grid">
        <section className="ui-card perf">
          <div className="perf-head">
            <b>
              <MemoryStick size={15} /> Mémoire
            </b>
            <span className="perf-value" style={{ color: C.mem }}>
              {s?.memUsed != null && s.memTotal ? `${formatBytes(s.memUsed)} / ${formatBytes(s.memTotal)}` : '—'}
            </span>
          </div>
          <Chart series={[samples.map((x) => x.memUsed)]} max={s?.memTotal ?? undefined} colors={[C.mem]} />
          <p className="faint">Fichier d’échange : {s?.swapUsed != null && s.swapTotal ? `${formatBytes(s.swapUsed)} / ${formatBytes(s.swapTotal)}` : NA}</p>
        </section>
        <section className="ui-card perf">
          <div className="perf-head">
            <b>
              <HardDrive size={15} /> Disque
            </b>
            <span className="perf-value" style={{ color: C.disk }}>
              <ArrowDown size={13} /> {rate(s?.diskRead ?? null)} <ArrowUp size={13} /> {rate(s?.diskWrite ?? null)}
            </span>
          </div>
          <Chart series={[samples.map((x) => x.diskRead), samples.map((x) => x.diskWrite)]} colors={[C.disk, '#fb923c']} />
        </section>
        <section className="ui-card perf">
          <div className="perf-head">
            <b>
              <Network size={15} /> Réseau
            </b>
            <span className="perf-value">
              <span style={{ color: C.net }}>
                <ArrowDown size={13} /> {rate(s?.netRx ?? null)}
              </span>{' '}
              <span style={{ color: C.netTx }}>
                <ArrowUp size={13} /> {rate(s?.netTx ?? null)}
              </span>
            </span>
          </div>
          <Chart series={[samples.map((x) => x.netRx), samples.map((x) => x.netTx)]} colors={[C.net, C.netTx]} />
        </section>
        <section className="ui-card perf">
          <div className="perf-head">
            <b>
              <Monitor size={15} /> Carte graphique
            </b>
            <span className="perf-value" style={{ color: C.gpu }}>
              {pct(s?.gpuLoad)}
            </span>
          </div>
          <Chart series={[samples.map((x) => x.gpuLoad)]} max={100} colors={[C.gpu]} />
          <p className="faint">{info?.gpus.map((g) => g.model).join(' · ')}</p>
          {s?.gpuLoad == null && <p className="faint">Utilisation non fournie par le pilote (cartes NVIDIA uniquement).</p>}
        </section>
      </div>
    </Page>
  )
}

// ─── Processus ─────────────────────────────────────────────────────────────────────────────

function Processes(): JSX.Element {
  const [list, setList] = useState<ProcessInfo[] | null>(null)
  const [sort, setSort] = useState<'cpu' | 'mem' | 'name'>('cpu')
  const [q, setQ] = useState('')
  useEffect(() => {
    let alive = true
    const load = (): void => void window.kit.invoke<ProcessInfo[]>('monitor:processes').then((p) => alive && setList(p))
    load()
    const t = setInterval(load, 3000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])
  const rows = (list ?? [])
    .filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'mem' ? b.mem - a.mem : b.cpu - a.cpu))
  const th = (id: typeof sort, label: string, num = false): JSX.Element => (
    <th className={`sortable${num ? ' num' : ''}`} onClick={() => setSort(id)}>
      {label}
      {sort === id ? ' ↓' : ''}
    </th>
  )
  return (
    <Page
      title="Processus"
      sub="Les programmes regroupés par nom (un navigateur en lance des dizaines). Mise à jour toutes les 3 s."
      tools={
        <label className="search">
          <Search size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer" />
        </label>
      }
    >
      <div className="ui-card proc-card">
        <table className="table">
          <thead>
            <tr>
              {th('name', 'Programme')}
              {th('cpu', 'Processeur', true)}
              {th('mem', 'Mémoire', true)}
              <th>Utilisateur</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.name} title={p.path}>
                <td>{p.name}</td>
                <td className="num">
                  <div className="cell-bar">
                    <Meter value={p.cpu} color={C.cpu} />
                    {p.cpu.toFixed(1)} %
                  </div>
                </td>
                <td className="num">{formatBytes(p.mem)}</td>
                <td className="faint">{p.user || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list && <div className="faint" style={{ padding: 14 }}>Lecture des processus…</div>}
      </div>
    </Page>
  )
}

// ─── Disques, système ──────────────────────────────────────────────────────────────────────

function Disks({ info }: { info: SystemInfo | null }): JSX.Element {
  const [vols, setVols] = useState<Volume[] | null>(null)
  useEffect(() => void window.kit.invoke<Volume[]>('monitor:volumes').then(setVols), [])
  return (
    <Page title="Disques" sub="Espace occupé sur chaque lecteur.">
      <div className="ui-col">
        {(vols ?? []).map((v) => {
          const p = (v.used / v.size) * 100
          return (
            <div key={v.mount} className="ui-card vol">
              <div className="vol-head">
                <HardDrive size={18} />
                <b>{v.label}</b>
                <span className="faint">{v.fs}</span>
                <span className="spacer" />
                <span>
                  <b>{formatBytes(v.size - v.used)}</b> libres sur {formatBytes(v.size)}
                </span>
              </div>
              <div className="vol-bar">
                <div style={{ width: `${p}%`, background: p > 90 ? 'var(--danger)' : p > 75 ? 'var(--warning)' : C.cpu }} />
              </div>
              <span className="faint">{p.toFixed(0)} % utilisé</span>
            </div>
          )
        })}
        {!vols && <div className="faint">Lecture des disques…</div>}
      </div>
      {info && info.disks.length > 0 && (
        <>
          <h2 className="ui-section-title">Disques physiques</h2>
          <div className="ui-card">
            <table className="table">
              <tbody>
                {info.disks.map((d, i) => (
                  <tr key={i}>
                    <td>{d.name}</td>
                    <td>{d.type}</td>
                    <td>{d.interface}</td>
                    <td className="num">{formatBytes(d.size)}</td>
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

function SystemView({ info }: { info: SystemInfo | null }): JSX.Element {
  if (!info) return <Page title="Système">Lecture des informations…</Page>
  const up = info.uptime
  const rows: [string, string][] = [
    ['Nom du PC', info.host],
    ['Système', `${info.os} ${info.osVersion} (${info.arch})`],
    ['Appareil', [info.manufacturer, info.model].filter(Boolean).join(' ') || '—'],
    ['Processeur', `${info.cpuBrand} · ${info.cpuPhysical} cœurs physiques, ${info.cpuCores} logiques${info.cpuSpeed ? ` · ${info.cpuSpeed} GHz` : ''}`],
    ['Mémoire', formatBytes(info.memTotal)],
    ['Cartes graphiques', info.gpus.map((g) => `${g.model}${g.vram ? ` (${formatBytes(g.vram)})` : ''}`).join(' · ') || '—'],
    ['Allumé depuis', `${Math.floor(up / 86400)} j ${Math.floor((up % 86400) / 3600)} h ${Math.floor((up % 3600) / 60)} min`]
  ]
  return (
    <Page title="Système" sub="Ce qu’il y a dans ton PC.">
      <div className="ui-card">
        <table className="table">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td className="faint" style={{ width: 180 }}>
                  {k}
                </td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="ui-section-title">Réseau</h2>
      <div className="ui-card">
        <table className="table">
          <tbody>
            {info.network.map((n) => (
              <tr key={n.iface}>
                <td>{n.iface}</td>
                <td className="mono">{n.ip4}</td>
                <td className="faint mono">{n.mac}</td>
                <td className="num">{n.speed ? `${n.speed} Mb/s` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Page>
  )
}
