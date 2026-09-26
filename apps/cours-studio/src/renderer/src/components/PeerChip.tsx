import { useState } from 'react'
import { Laptop } from 'lucide-react'
import { useStore } from '../store'
import PeerSyncModal from './PeerSyncModal'

/** Pastille dans la barre de titre : PC associé en ligne, et nombre de cours à synchroniser. */
export default function PeerChip() {
  const paired = useStore((s) => s.paired)
  const [openId, setOpenId] = useState<string | null>(null)
  const onlinePeers = paired.filter((p) => p.online)
  const open = paired.find((p) => p.id === openId)

  return (
    <>
      {onlinePeers.map((p) => (
        <button
          key={p.id}
          className={`peer-chip${p.pending ? ' pending' : ''}`}
          onClick={() => setOpenId(p.id)}
          data-tooltip={p.pending ? `${p.pending} cours à synchroniser avec ${p.name}` : `${p.name} est connecté et à jour`}
          data-tooltip-dir="left-down"
        >
          <span className="peer-chip-dot" />
          <Laptop size={13} />
          <span className="peer-chip-name">{p.name}</span>
          {!!p.pending && <span className="peer-chip-count">{p.pending}</span>}
        </button>
      ))}
      {open && <PeerSyncModal peer={open} onClose={() => setOpenId(null)} />}
    </>
  )
}
