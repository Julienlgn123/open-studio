import { useEffect, useRef, useState } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { renderKatex } from './math'

function MathNodeView({ node, updateAttributes, selected, displayMode }: NodeViewProps & { displayMode: boolean }) {
  const [editing, setEditing] = useState(!node.attrs.latex)
  const [value, setValue] = useState(node.attrs.latex)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  function commit() {
    updateAttributes({ latex: value })
    setEditing(false)
  }

  const Wrapper = NodeViewWrapper
  const tag = displayMode ? 'div' : 'span'

  return (
    <Wrapper as={tag} style={{ display: displayMode ? 'block' : 'inline-block' }} className={selected ? 'math-node-selected' : ''}>
      {editing ? (
        <input
          ref={inputRef}
          className="math-edit-input"
          value={value}
          placeholder="\mathbb{R}, \frac{a}{b}, \sqrt{x}..."
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            if (e.key === 'Escape') { setValue(node.attrs.latex); setEditing(false) }
          }}
        />
      ) : (
        <span
          className={displayMode ? 'math-block-rendered' : 'math-inline-rendered'}
          onClick={() => setEditing(true)}
          dangerouslySetInnerHTML={{ __html: renderKatex(node.attrs.latex, displayMode) || '<span class="math-placeholder">formule</span>' }}
        />
      )}
    </Wrapper>
  )
}

export default MathNodeView
