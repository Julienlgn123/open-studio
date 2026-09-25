import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import SketchNodeView from './SketchNodeView'

// A freehand sketch stored inline as a PNG data URL. Block-level atom, so it
// serialises to <img data-sketch src="data:image/png;..."> and survives a
// plain innerHTML round-trip like a pasted image.
export const Sketch = Node.create({
  name: 'sketch',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: '' },
      width: { default: 640 },
      height: { default: 360 }
    }
  },

  parseHTML() {
    return [{
      tag: 'img[data-sketch]',
      getAttrs: (el) => ({
        src: (el as HTMLElement).getAttribute('src') || '',
        width: Number((el as HTMLElement).getAttribute('width')) || 640,
        height: Number((el as HTMLElement).getAttribute('height')) || 360
      })
    }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes, {
      'data-sketch': '',
      src: node.attrs.src,
      width: node.attrs.width,
      height: node.attrs.height,
      class: 'sketch-image'
    })]
  },

  addNodeViews() {
    return ReactNodeViewRenderer(SketchNodeView)
  }
})
