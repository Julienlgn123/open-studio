import { Node, mergeAttributes } from '@tiptap/core'

// An inline reference to another course, rendered as a clickable chip.
// Serialised as <a data-course-id="..." class="course-link">Label</a> so it
// survives a plain innerHTML round-trip and can be found by the backlinks scan.
export const CourseLink = Node.create({
  name: 'courseLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      courseId: { default: null },
      label: { default: '' }
    }
  },

  parseHTML() {
    return [{
      tag: 'a[data-course-id]',
      getAttrs: (el) => ({
        courseId: (el as HTMLElement).getAttribute('data-course-id'),
        label: (el as HTMLElement).textContent || ''
      })
    }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'a',
      mergeAttributes(HTMLAttributes, {
        'data-course-id': node.attrs.courseId,
        class: 'course-link',
        href: '#'
      }),
      `[[${node.attrs.label}]]`
    ]
  },

  renderText({ node }) {
    return `[[${node.attrs.label}]]`
  }
})
