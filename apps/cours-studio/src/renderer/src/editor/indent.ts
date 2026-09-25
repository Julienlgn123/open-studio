import { Extension } from '@tiptap/core'

const MAX_INDENT = 8
const STEP_PX = 28

export const Indent = Extension.create({
  name: 'indent',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el) => Number(el.getAttribute('data-indent')) || 0,
            renderHTML: (attrs) => {
              if (!attrs.indent) return {}
              return { 'data-indent': attrs.indent, style: `margin-left: ${attrs.indent * STEP_PX}px` }
            }
          }
        }
      }
    ]
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const { editor } = this
        // Inside a list: indent the list item instead of the paragraph
        if (editor.can().sinkListItem('listItem')) return editor.commands.sinkListItem('listItem')
        if (editor.can().sinkListItem('taskItem')) return editor.commands.sinkListItem('taskItem')

        const attrs = editor.getAttributes('paragraph').indent !== undefined
          ? editor.getAttributes('paragraph')
          : editor.getAttributes('heading')
        const current = attrs.indent ?? 0
        if (current >= MAX_INDENT) return true
        return editor.chain().focus().updateAttributes(editor.isActive('heading') ? 'heading' : 'paragraph', { indent: current + 1 }).run()
      },
      'Shift-Tab': () => {
        const { editor } = this
        if (editor.can().liftListItem('listItem')) return editor.commands.liftListItem('listItem')
        if (editor.can().liftListItem('taskItem')) return editor.commands.liftListItem('taskItem')

        const attrs = editor.getAttributes('paragraph').indent !== undefined
          ? editor.getAttributes('paragraph')
          : editor.getAttributes('heading')
        const current = attrs.indent ?? 0
        if (current <= 0) return true
        return editor.chain().focus().updateAttributes(editor.isActive('heading') ? 'heading' : 'paragraph', { indent: current - 1 }).run()
      }
    }
  }
})
