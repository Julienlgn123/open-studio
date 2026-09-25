import { useState, useRef, useEffect } from 'react'
import { Play, Pause, Volume2, VolumeX, ExternalLink, Mic, Monitor, X } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

interface Props {
  type: 'audio' | 'video'
  filePath: string
  onClose?: () => void
}

export default function MediaPlayer({ type, filePath, onClose }: Props) {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [error, setError] = useState(false)
  const mediaRef = useRef<HTMLAudioElement & HTMLVideoElement>(null)

  useEffect(() => {
    api.media.url(filePath).then((url: string) => setMediaUrl(url)).catch(() => setError(true))
  }, [filePath])

  function toggle() {
    const el = mediaRef.current
    if (!el) return
    if (playing) { el.pause(); setPlaying(false) }
    else { el.play(); setPlaying(true) }
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const el = mediaRef.current
    if (!el) return
    el.currentTime = Number(e.target.value)
    setCurrentTime(Number(e.target.value))
  }

  function changeVolume(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Number(e.target.value)
    setVolume(v)
    if (mediaRef.current) mediaRef.current.volume = v
    setMuted(v === 0)
  }

  function toggleMute() {
    const el = mediaRef.current
    if (!el) return
    el.muted = !muted
    setMuted(!muted)
  }

  function fmt(s: number) {
    if (!isFinite(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0

  if (error) {
    return (
      <div style={{ padding: '10px 14px', background: 'var(--danger-dim)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--danger)' }}>
        Fichier introuvable
      </div>
    )
  }

  const isVideo = type === 'video'

  return (
    <div style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden'
    }}>
      {/* Video preview */}
      {isVideo && mediaUrl && (
        <div style={{ background: '#000', position: 'relative', maxHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <video
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            src={mediaUrl}
            style={{ maxWidth: '100%', maxHeight: 300, display: 'block' }}
            onTimeUpdate={(e) => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
            onLoadedMetadata={(e) => setDuration((e.target as HTMLVideoElement).duration)}
            onEnded={() => setPlaying(false)}
            onError={() => setError(true)}
          />
          {!playing && (
            <button
              onClick={toggle}
              style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.4)', border: 'none', cursor: 'pointer', color: 'white'
              }}
            >
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                <Play size={22} fill="white" />
              </div>
            </button>
          )}
        </div>
      )}

      {/* Hidden audio element */}
      {!isVideo && mediaUrl && (
        <audio
          ref={mediaRef as React.RefObject<HTMLAudioElement>}
          src={mediaUrl}
          onTimeUpdate={(e) => setCurrentTime((e.target as HTMLAudioElement).currentTime)}
          onLoadedMetadata={(e) => setDuration((e.target as HTMLAudioElement).duration)}
          onEnded={() => setPlaying(false)}
          onError={() => setError(true)}
        />
      )}

      {/* Controls */}
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500,
            color: isVideo ? 'var(--accent)' : 'var(--success)'
          }}>
            {isVideo ? <Monitor size={13} /> : <Mic size={13} />}
            {isVideo ? 'Enregistrement vidéo' : 'Enregistrement audio'}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <button
              className="icon-btn"
              onClick={() => api.recording.reveal(filePath)}
              data-tooltip="Ouvrir dans l'explorateur"
              style={{ width: 24, height: 24 }}
            >
              <ExternalLink size={12} />
            </button>
            {onClose && (
              <button className="icon-btn" onClick={onClose} style={{ width: 24, height: 24 }}>
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Play/pause */}
          <button
            className="icon-btn"
            onClick={toggle}
            disabled={!mediaUrl}
            style={{
              width: 32, height: 32, flexShrink: 0,
              background: isVideo ? 'var(--accent-dim)' : 'var(--success-dim)',
              color: isVideo ? 'var(--accent-light)' : 'var(--success)',
              borderRadius: '50%'
            }}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>

          {/* Time */}
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', width: 36, flexShrink: 0 }}>
            {fmt(currentTime)}
          </span>

          {/* Scrubber */}
          <div style={{ flex: 1, position: 'relative', height: 4 }}>
            <div style={{ position: 'absolute', inset: 0, background: 'var(--bg-overlay)', borderRadius: 2 }} />
            <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${pct}%`, background: isVideo ? 'var(--accent)' : 'var(--success)', borderRadius: 2, transition: 'width 0.1s' }} />
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={seek}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}
            />
          </div>

          {/* Duration */}
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', width: 36, flexShrink: 0, textAlign: 'right' }}>
            {fmt(duration)}
          </span>

          {/* Volume */}
          <button className="icon-btn" onClick={toggleMute} style={{ width: 24, height: 24, flexShrink: 0 }}>
            {muted || volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={changeVolume}
            style={{ width: 60, accentColor: 'var(--accent)', cursor: 'pointer' }}
          />
        </div>
      </div>
    </div>
  )
}
