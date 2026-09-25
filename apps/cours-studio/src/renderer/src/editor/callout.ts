import { Node, mergeAttributes } from '@tiptap/core'

export const CALLOUT_TYPES = ['info', 'attention', 'definition', 'astuce'] as const
export type CalloutType = (typeof CALLOUT_TYPES)[number]

// A coloured box containing block content. Serialises to
// <div data-callout="info">…</div> so it round-trips through innerHTML.
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      type: {
        default: 'info',
        parseHTML: (el) => el.getAttribute('data-callout') || 'info',
        renderHTML: (attrs) => ({ 'data-callout': attrs.type })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'callout' }), 0]
  },

  addCommands() {
    return {
      setCallout:
        (type: CalloutType) =>
        ({ commands }) =>
          commands.wrapIn(this.name, { type })
    }
  }
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (type: CalloutType) => ReturnType
    }
  }
}
