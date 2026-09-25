import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Typography from '@tiptap/extension-typography'
import CodeBlock from '@tiptap/extension-code-block'
import TextAlign from '@tiptap/extension-text-align'
import Link from '@tiptap/extension-link'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import Image from '@tiptap/extension-image'
import CharacterCount from '@tiptap/extension-character-count'
import {
  Bold, Italic, UnderlineIcon, Strikethrough, Highlighter,
  Heading1, Heading2, Heading3, List, ListOrdered, ListChecks,
  Code, Quote, Minus, Undo, Redo, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Link as LinkIcon, Subscript as SubscriptIcon, Superscript as SuperscriptIcon,
  Sigma, Keyboard, Palette, Table as TableIcon, Image as ImageIcon, Layers, PenTool, HelpCircle
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { MathInline, MathBlock } from '../editor/math'
import { Indent } from '../editor/indent'
import { SlashCommand } from '../editor/slashCommand'
import { Sketch } from '../editor/sketch'
import { Callout } from '../editor/callout'
import { CourseLink } from '../editor/courseLink'
import { WikiLink, setWikiCourses } from '../editor/wikiLink'
import type { WikiItem } from './WikiMenuList'
import ShortcutsModal from './ShortcutsModal'

interface Props {
  content: string
  onChange: (html: string) => void
  readOnly?: boolean
  // When provided, a toolbar button turns the current selection into a flashcard
  onQuickFlashcard?: (selectedText: string) => void
  // When provided, a toolbar button asks the AI to explain the current selection
  onExplainSelection?: (selectedText: string) => void
  // Course list for [[wiki-links]] + handler when one is clicked
  courses?: WikiItem[]
  onNavigateCourse?: (courseId: string) => void
  // Reports live word/character counts
  onStats?: (stats: { words: number; chars: number }) => void
}

const TEXT_COLORS = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#22d3ee', '#818cf8', '#e879f9', '#e5e7eb']

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function Editor({ content, onChange, readOnly = false, onQuickFlashcard, onExplainSelection, courses, onNavigateCourse, onStats }: Props) {
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)

  if (courses) setWikiCourses(courses)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Placeholder.configure({ placeholder: 'Commence à écrire ton cours... (tape "/" pour insérer un bloc)' }),
      Underline,
      Highlight.configure({ multicolor: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Typography,
      CodeBlock,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false, autolink: true }),
      Subscript,
      Superscript,
      TextStyle,
      Color,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ inline: false, allowBase64: true }),
      MathInline,
      MathBlock,
      Indent,
      CourseLink,
      Sketch,
      Callout,
      CharacterCount,
      ...(readOnly ? [] : [SlashCommand, WikiLink])
    ],
    content,
    editable: !readOnly,
    onCreate: ({ editor }) => {
      onStats?.({ words: editor.storage.characterCount.words(), chars: editor.storage.characterCount.characters() })
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
      onStats?.({ words: editor.storage.characterCount.words(), chars: editor.storage.characterCount.characters() })
    },
    editorProps: {
      handleClickOn: (_view, _pos, node) => {
        if (node.type.name === 'courseLink' && node.attrs.courseId && onNavigateCourse) {
          onNavigateCourse(node.attrs.courseId as string)
          return true
        }
        return false
      },
      handlePaste: (view, event) => {
        const items = Array.from(event.clipboardData?.items ?? [])
        const imageItem = items.find((i) => i.type.startsWith('image/'))
        if (!imageItem) return false
        const file = imageItem.getAsFile()
        if (!file) return false
        event.preventDefault()
        fileToDataUrl(file).then((src) => {
          const { schema } = view.state
          const node = schema.nodes.image.create({ src })
          const tr = view.state.tr.replaceSelectionWith(node)
          view.dispatch(tr)
        })
        return true
      },
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'))
        if (files.length === 0) return false
        event.preventDefault()
        files.forEach((file) => {
          fileToDataUrl(file).then((src) => {
            const { schema } = view.state
            const node = schema.nodes.image.create({ src })
            const tr = view.state.tr.replaceSelectionWith(node)
            view.dispatch(tr)
          })
        })
        return true
      }
    }
  })

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, false)
    }
  }, [content])

  useEffect(() => {
    return () => { editor?.destroy() }
  }, [editor])

  if (!editor) return null

  function ToolBtn({
    onClick, active = false, title, children
  }: { onClick: () => void; active?: boolean; title?: string; children: React.ReactNode }) {
    return (
      <button
        className={`icon-btn ${active ? 'active' : ''}`}
        onClick={onClick}
        data-tooltip={title}
        onMouseDown={(e) => e.preventDefault()}
      >
        {children}
      </button>
    )
  }

  if (readOnly) {
    return (
      <div style={{ userSelect: 'text' }}>
        <EditorContent editor={editor} />
      </div>
    )
  }

  return (
    <div className="editor-wrap" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="editor-toolbar editor-toolbar-pinned">
        <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Gras">
          <Bold size={14} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italique">
          <Italic size={14} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Souligné">
          <UnderlineIcon size={14} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Barré">
          <Strikethrough size={14} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')} title="Surligner">
          <Highlighter size={14} />
        </ToolBtn>

        <div className="editor-toolbar-sep" />

        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Titre 1">
          <Heading1 size={14} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Titre 2">
          <Heading2 size={14} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Titre 3">
          <Heading3 size={14} />
        </ToolBtn>

        <div className="editor-toolbar-sep" />

        <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Liste">
          <List size={14} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Liste numérotée">
          <ListOrdered size={14} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive('taskList')} title="Cases à cocher">
          <ListChecks size={14} />
        </ToolBtn>

        <div className="editor-toolbar-sep" />

        <ToolBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="Code inline">
          <Code size={14} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Citation">
          <Quote size={14} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Séparateur">
          <Minus size={14} />
        </ToolBtn>

        <div className="editor-toolbar-sep" />

        <ToolBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Aligner à gauche">
          <AlignLeft size={14} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Centrer">
          <AlignCenter size={14} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Aligner à droite">
          <AlignRight size={14} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign('justify').run()} active={editor.isActive({ textAlign: 'justify' })} title="Justifier">
          <AlignJustify size={14} />
        </ToolBtn>

        <div className="editor-toolbar-sep" />

        <ToolBtn
          onClick={() => {
            const url = window.prompt('URL du lien :', editor.getAttributes('link').href ?? 'https://')
            if (url === null) return
            if (url === '') { editor.chain().focus().unsetLink().run(); return }
            editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
          }}
          active={editor.isActive('link')}
          title="Lien"
        >
          <LinkIcon size={14} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleSubscript().run()} active={editor.isActive('subscript')} title="Indice">
          <SubscriptIcon size={14} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleSuperscript().run()} active={editor.isActive('superscript')} title="Exposant">
          <SuperscriptIcon size={14} />
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().insertContent({ type: 'mathInline', attrs: { latex: '' } }).run()}
          title="Formule LaTeX (mathbb, frac, sqrt...)"
        >
          <Sigma size={14} />
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          title="Insérer un tableau"
        >
          <TableIcon size={14} />
        </ToolBtn>
        <ToolBtn
          onClick={() => {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = 'image/*'
            input.onchange = () => {
              const file = input.files?.[0]
              if (!file) return
              fileToDataUrl(file).then((src) => editor.chain().focus().setImage({ src }).run())
            }
            input.click()
          }}
          title="Insérer une capture d'écran / image"
        >
          <ImageIcon size={14} />
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().insertContent({ type: 'sketch' }).run()}
          title="Dessiner un schéma"
        >
          <PenTool size={14} />
        </ToolBtn>

        <div style={{ position: 'relative' }}>
          <ToolBtn onClick={() => setShowColorPicker(!showColorPicker)} title="Couleur du texte">
            <Palette size={14} />
          </ToolBtn>
          {showColorPicker && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 8, display: 'flex', gap: 5, zIndex: 20 }}>
              {TEXT_COLORS.map((c) => (
                <div
                  key={c}
                  onClick={() => { editor.chain().focus().setColor(c).run(); setShowColorPicker(false) }}
                  style={{ width: 16, height: 16, borderRadius: '50%', background: c, cursor: 'pointer' }}
                />
              ))}
              <div
                onClick={() => { editor.chain().focus().unsetColor().run(); setShowColorPicker(false) }}
                style={{ width: 16, height: 16, borderRadius: '50%', border: '1px solid var(--border)', cursor: 'pointer' }}
                title="Réinitialiser"
              />
            </div>
          )}
        </div>

        {onQuickFlashcard && (
          <ToolBtn
            onClick={() => {
              const { from, to } = editor.state.selection
              const text = editor.state.doc.textBetween(from, to, ' ').trim()
              onQuickFlashcard(text)
            }}
            title="Créer une flashcard depuis la sélection"
          >
            <Layers size={14} />
          </ToolBtn>
        )}
        {onExplainSelection && (
          <ToolBtn
            onClick={() => {
              const { from, to } = editor.state.selection
              const text = editor.state.doc.textBetween(from, to, ' ').trim()
              onExplainSelection(text)
            }}
            title="Expliquer la sélection simplement (IA)"
          >
            <HelpCircle size={14} />
          </ToolBtn>
        )}

        <div className="editor-toolbar-sep" />

        <ToolBtn onClick={() => editor.chain().focus().undo().run()} title="Annuler">
          <Undo size={14} />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().redo().run()} title="Rétablir">
          <Redo size={14} />
        </ToolBtn>

        <ToolBtn onClick={() => setShowShortcuts(true)} title="Raccourcis clavier" >
          <Keyboard size={14} />
        </ToolBtn>
      </div>

      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}

      <div style={{ flex: 1, userSelect: 'text' }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
