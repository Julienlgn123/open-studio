import { useState } from 'react'
import Modal from './Modal'
import { EmojiPicker, ColorPicker } from './Pickers'
import { useStore } from '../store'
import type { VirtualFolder } from '@shared/types'

interface Props {
  folder?: VirtualFolder
  onClose: () => void
}

export default function FolderModal({ folder, onClose }: Props): JSX.Element {
  const { loadFolders, toast } = useStore()
  const [name, setName] = useState(folder?.name ?? '')
  const [emoji, setEmoji] = useState(folder?.emoji ?? '📁')
  const [color, setColor] = useState(folder?.color ?? '#7c6ff7')
  const [busy, setBusy] = useState(false)

  async function submit(): Promise<void> {
    if (!name.trim()) return
    setBusy(true)
    try {
      if (folder) {
        await window.api.folders.update(folder.id, { name: name.trim(), emoji, color })
        toast('Dossier mis à jour', 'success')
      } else {
        await window.api.folders.create({ name: name.trim(), emoji, color })
        toast('Dossier créé', 'success')
      }
      await loadFolders()
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erreur', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={folder ? 'Modifier le dossier' : 'Nouveau dossier'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !name.trim()}>
            {folder ? 'Enregistrer' : 'Créer'}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field-label">Nom</label>
        <input
          className="field-input"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Documents, Vidéos…"
        />
      </div>
      <div className="field">
        <label className="field-label">Icône</label>
        <EmojiPicker value={emoji} onChange={setEmoji} />
      </div>
      <div className="field">
        <label className="field-label">Couleur</label>
        <ColorPicker value={color} onChange={setColor} />
      </div>
    </Modal>
  )
}
