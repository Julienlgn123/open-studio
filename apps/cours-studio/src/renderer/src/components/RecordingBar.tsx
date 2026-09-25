import { useState, useRef, useEffect } from 'react'
import { Mic, Monitor, Square, Pause, Play, X } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (window as any).api

interface Props {
  courseId: string
  subjectId: string
  subjectName: string
  courseName: string
  onSaved: (type: 'audio' | 'video', path: string) => void
}

type RecordState = 'idle' | 'recording' | 'paused'

export default function RecordingBar({ courseId, subjectId, subjectName, courseName, onSaved }: Props) {
  const [audioState, setAudioState] = useState<RecordState>('idle')
  const [videoState, setVideoState] = useState<RecordState>('idle')
  const [audioDuration, setAudioDuration] = useState(0)
  const [videoDuration, setVideoDuration] = useState(0)
  const [saving, setSaving] = useState(false)

  const audioRecorder = useRef<MediaRecorder | null>(null)
  const videoRecorder = useRef<MediaRecorder | null>(null)
  const audioChunks = useRef<Blob[]>([])
  const videoChunks = useRef<Blob[]>([])
  const audioTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const videoTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      audioRecorder.current?.stop()
      videoRecorder.current?.stop()
      if (audioTimer.current) clearInterval(audioTimer.current)
      if (videoTimer.current) clearInterval(videoTimer.current)
    }
  }, [])

  function formatTime(s: number) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  async function startAudio() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const rec = new MediaRecorder(stream)
    audioChunks.current = []
    rec.ondataavailable = (e) => audioChunks.current.push(e.data)
    rec.onstop = async () => {
      const blob = new Blob(audioChunks.current, { type: 'audio/webm' })
      await saveRecording('audio', blob)
      stream.getTracks().forEach((t) => t.stop())
    }
    rec.start(500)
    audioRecorder.current = rec
    setAudioState('recording')
    setAudioDuration(0)
    audioTimer.current = setInterval(() => setAudioDuration((d) => d + 1), 1000)
  }

  function pauseAudio() {
    if (audioRecorder.current?.state === 'recording') {
      audioRecorder.current.pause()
      setAudioState('paused')
      if (audioTimer.current) clearInterval(audioTimer.current)
    } else if (audioRecorder.current?.state === 'paused') {
      audioRecorder.current.resume()
      setAudioState('recording')
      audioTimer.current = setInterval(() => setAudioDuration((d) => d + 1), 1000)
    }
  }

  function stopAudio() {
    audioRecorder.current?.stop()
    setAudioState('idle')
    if (audioTimer.current) clearInterval(audioTimer.current)
  }

  async function startVideo() {
    const sources = await api.recording.getSources()
    const screen = sources.find((s: { name: string }) => s.name === 'Entire Screen') ?? sources[0]
    if (!screen) return

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        // @ts-ignore
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: screen.id
        }
      }
    })

    const rec = new MediaRecorder(stream)
    videoChunks.current = []
    rec.ondataavailable = (e) => videoChunks.current.push(e.data)
    rec.onstop = async () => {
      const blob = new Blob(videoChunks.current, { type: 'video/webm' })
      await saveRecording('video', blob)
      stream.getTracks().forEach((t) => t.stop())
    }
    rec.start(500)
    videoRecorder.current = rec
    setVideoState('recording')
    setVideoDuration(0)
    videoTimer.current = setInterval(() => setVideoDuration((d) => d + 1), 1000)
  }

  function pauseVideo() {
    if (videoRecorder.current?.state === 'recording') {
      videoRecorder.current.pause()
      setVideoState('paused')
      if (videoTimer.current) clearInterval(videoTimer.current)
    } else if (videoRecorder.current?.state === 'paused') {
      videoRecorder.current.resume()
      setVideoState('recording')
      videoTimer.current = setInterval(() => setVideoDuration((d) => d + 1), 1000)
    }
  }

  function stopVideo() {
    videoRecorder.current?.stop()
    setVideoState('idle')
    if (videoTimer.current) clearInterval(videoTimer.current)
  }

  async function saveRecording(type: 'audio' | 'video', blob: Blob) {
    setSaving(true)
    try {
      const buffer = Array.from(new Uint8Array(await blob.arrayBuffer()))
      const path = await api.recording.save({ subjectName, courseName, type, buffer })
      onSaved(type, path)
    } finally {
      setSaving(false)
    }
  }

  const isActive = audioState !== 'idle' || videoState !== 'idle'

  return (
    <div className="recording-bar">
      {/* Audio section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Mic size={14} style={{ color: audioState === 'recording' ? 'var(--recording)' : 'var(--text-secondary)' }} />
        {audioState === 'idle' ? (
          <button className="btn btn-secondary btn-sm" onClick={startAudio}>
            Enregistrer audio
          </button>
        ) : (
          <>
            {audioState === 'recording' && <div className="recording-dot" />}
            <span className="recording-timer">{formatTime(audioDuration)}</span>
            <button className="icon-btn btn-sm" onClick={pauseAudio}>
              {audioState === 'recording' ? <Pause size={13} /> : <Play size={13} />}
            </button>
            <button className="icon-btn btn-sm danger" onClick={stopAudio}>
              <Square size={13} />
            </button>
          </>
        )}
      </div>

      <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

      {/* Video section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Monitor size={14} style={{ color: videoState === 'recording' ? 'var(--accent)' : 'var(--text-secondary)' }} />
        {videoState === 'idle' ? (
          <button className="btn btn-secondary btn-sm" onClick={startVideo}>
            Enregistrer écran
          </button>
        ) : (
          <>
            {videoState === 'recording' && <div className="recording-dot" style={{ background: 'var(--accent)' }} />}
            <span className="recording-timer">{formatTime(videoDuration)}</span>
            <button className="icon-btn btn-sm" onClick={pauseVideo}>
              {videoState === 'recording' ? <Pause size={13} /> : <Play size={13} />}
            </button>
            <button className="icon-btn btn-sm danger" onClick={stopVideo}>
              <Square size={13} />
            </button>
          </>
        )}
      </div>

      {saving && (
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
          <span className="spinner" style={{ width: 12, height: 12 }} /> Sauvegarde...
        </div>
      )}
    </div>
  )
}
