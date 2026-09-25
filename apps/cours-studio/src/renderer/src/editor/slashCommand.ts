import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import type { Editor, Range } from '@tiptap/core'
import SlashMenuList, { type SlashMenuListRef } from '../components/SlashMenuList'

export interface SlashItem {
  title: string
  desc: string
  icon: string
  command: (opts: { editor: Editor; range: Range }) => void
}

export const SLASH_ITEMS: SlashItem[] = [
  { title: 'Titre 1', desc: 'Grand titre', icon: 'H1', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run() },
  { title: 'Titre 2', desc: 'Titre moyen', icon: 'H2', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run() },
  { title: 'Titre 3', desc: 'Petit titre', icon: 'H3', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run() },
  { title: 'Liste à puces', desc: 'Liste simple', icon: '•', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run() },
  { title: 'Liste numérotée', desc: 'Liste ordonnée', icon: '1.', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run() },
  { title: 'Cases à cocher', desc: 'Liste de tâches', icon: '☑', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run() },
  { title: 'Citation', desc: 'Bloc de citation', icon: '❝', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run() },
  { title: 'Code', desc: 'Bloc de code', icon: '</>', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run() },
  { title: 'Séparateur', desc: 'Ligne horizontale', icon: '—', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run() },
  { title: 'Formule (LaTeX)', desc: 'Formule mathématique en ligne', icon: '∑', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).insertContent({ type: 'mathInline', attrs: { latex: '' } }).run() },
  { title: 'Formule bloc', desc: 'Formule centrée sur sa ligne', icon: '∫', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).insertContent({ type: 'mathBlock', attrs: { latex: '' } }).run() },
  { title: 'Schéma', desc: 'Zone de dessin à main levée', icon: '✏️', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).insertContent({ type: 'sketch' }).run() },
  { title: 'Info', desc: 'Encadré bleu', icon: 'ℹ️', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setCallout('info').run() },
  { title: 'Attention', desc: 'Encadré orange', icon: '⚠️', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setCallout('attention').run() },
  { title: 'Définition', desc: 'Encadré violet', icon: '📖', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setCallout('definition').run() },
  { title: 'Astuce', desc: 'Encadré vert', icon: '💡', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setCallout('astuce').run() }
]

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        startOfLine: false,
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashItem }) => {
          props.command({ editor, range })
        }
      }
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
        items: ({ query }: { query: string }) =>
          SLASH_ITEMS.filter((item) => item.title.toLowerCase().includes(query.toLowerCase())).slice(0, 10),
        render: () => {
          let component: ReactRenderer<SlashMenuListRef>
          let popup: HTMLDivElement

          return {
            onStart: (props) => {
              component = new ReactRenderer(SlashMenuList, { props, editor: props.editor })
              popup = document.createElement('div')
              popup.className = 'slash-menu-popup'
              document.body.appendChild(popup)
              popup.appendChild(component.element)
              positionPopup(popup, props.clientRect?.())
            },
            onUpdate: (props) => {
              component.updateProps(props)
              positionPopup(popup, props.clientRect?.())
            },
            onKeyDown: (props) => {
              if (props.event.key === 'Escape') { popup.remove(); return true }
              return component.ref?.onKeyDown(props) ?? false
            },
            onExit: () => {
              popup.remove()
              component.destroy()
            }
          }
        }
      })
    ]
  }
})

function positionPopup(popup: HTMLDivElement, rect?: DOMRect | null) {
  if (!rect) return
  popup.style.position = 'fixed'
  popup.style.left = `${rect.left}px`
  popup.style.top = `${rect.bottom + 6}px`
  popup.style.zIndex = '4000'
}
