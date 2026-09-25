import { Node, mergeAttributes, nodeInputRule } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import katex from 'katex'
import MathNodeView from './MathNodeView'

function MathInlineNodeView(props: NodeViewProps) { return MathNodeView({ ...props, displayMode: false }) }
function MathBlockNodeView(props: NodeViewProps) { return MathNodeView({ ...props, displayMode: true }) }

// Blackboard-bold shorthands, pre-imported so \RR, \NN... work without extra setup.
// \mathbb{...} itself is a native KaTeX command and needs no import.
export const MATH_MACROS: Record<string, string> = {
  '\\RR': '\\mathbb{R}',
  '\\NN': '\\mathbb{N}',
  '\\ZZ': '\\mathbb{Z}',
  '\\QQ': '\\mathbb{Q}',
  '\\CC': '\\mathbb{C}'
}

export function renderKatex(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex || '', { throwOnError: false, displayMode, macros: MATH_MACROS, strict: false })
  } catch {
    return `<span class="math-error">${latex}</span>`
  }
}

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return { latex: { default: '' } }
  },
  parseHTML() {
    return [{ tag: 'span[data-math-inline]', getAttrs: (el) => ({ latex: (el as HTMLElement).getAttribute('data-latex') || '' }) }]
  },
  renderHTML({ node, HTMLAttributes }) {
    const dom = document.createElement('span')
    Object.entries(mergeAttributes(HTMLAttributes, { 'data-math-inline': '', 'data-latex': node.attrs.latex, class: 'math-inline-rendered' }))
      .forEach(([k, v]) => dom.setAttribute(k, String(v)))
    dom.innerHTML = renderKatex(node.attrs.latex, false)
    return dom
  },
  addNodeViews() {
    return ReactNodeViewRenderer(MathInlineNodeView)
  },
  addInputRules() {
    return [
      nodeInputRule({
        find: /(?:^|\s)\$([^$\n]+)\$$/,
        type: this.type,
        getAttributes: (match) => ({ latex: match[1] })
      })
    ]
  }
})

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  addAttributes() {
    return { latex: { default: '' } }
  },
  parseHTML() {
    return [{ tag: 'div[data-math-block]', getAttrs: (el) => ({ latex: (el as HTMLElement).getAttribute('data-latex') || '' }) }]
  },
  renderHTML({ node, HTMLAttributes }) {
    const dom = document.createElement('div')
    Object.entries(mergeAttributes(HTMLAttributes, { 'data-math-block': '', 'data-latex': node.attrs.latex, class: 'math-block-rendered' }))
      .forEach(([k, v]) => dom.setAttribute(k, String(v)))
    dom.innerHTML = renderKatex(node.attrs.latex, true)
    return dom
  },
  addNodeViews() {
    return ReactNodeViewRenderer(MathBlockNodeView)
  },
  addInputRules() {
    return [
      nodeInputRule({
        find: /\$\$([^$]+)\$\$\s$/,
        type: this.type,
        getAttributes: (match) => ({ latex: match[1] })
      })
    ]
  }
})
