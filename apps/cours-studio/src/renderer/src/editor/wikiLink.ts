import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'
import { ReactRenderer } from '@tiptap/react'
import type { Editor, Range } from '@tiptap/core'
import WikiMenuList, { type WikiMenuListRef, type WikiItem } from '../components/WikiMenuList'

// Must differ from the slash-menu's suggestion plugin key, otherwise ProseMirror
// throws "Adding different instances of a keyed plugin (suggestion)".
const wikiLinkPluginKey = new PluginKey('wikiLinkSuggestion')

// The course list changes as the user creates/renames courses, but the editor
// extension is built once. Keep the current list in module state and let the
// Editor refresh it on every render.
let courseList: WikiItem[] = []
export function setWikiCourses(items: WikiItem[]): void {
  courseList = items
}

export const WikiLink = Extension.create({
  name: 'wikiLink',

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: wikiLinkPluginKey,
        char: '[[',
        startOfLine: false,
        allowSpaces: true,
        allowedPrefixes: null,
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: WikiItem }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent({ type: 'courseLink', attrs: { courseId: props.id, label: props.title } })
            .insertContent(' ')
            .run()
        },
        items: ({ query }: { query: string }) => {
          const q = query.toLowerCase()
          return courseList.filter((c) => c.title.toLowerCase().includes(q)).slice(0, 8)
        },
        render: () => {
          let component: ReactRenderer<WikiMenuListRef>
          let popup: HTMLDivElement

          return {
            onStart: (props) => {
              component = new ReactRenderer(WikiMenuList, { props, editor: props.editor })
              popup = document.createElement('div')
              popup.className = 'slash-menu-popup'
              document.body.appendChild(popup)
              popup.appendChild(component.element)
              position(popup, props.clientRect?.())
            },
            onUpdate: (props) => {
              component.updateProps(props)
              position(popup, props.clientRect?.())
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

function position(popup: HTMLDivElement, rect?: DOMRect | null): void {
  if (!rect) return
  popup.style.position = 'fixed'
  popup.style.left = `${rect.left}px`
  popup.style.top = `${rect.bottom + 6}px`
  popup.style.zIndex = '4000'
}
