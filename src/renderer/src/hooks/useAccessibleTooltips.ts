import { useEffect } from 'react'

// Icon-only buttons across the app rely on a data-tooltip attribute for their (CSS-only,
// hover-triggered) label — invisible to screen readers, since generated ::after content
// isn't a substitute for a real accessible name. Rather than hand-adding aria-label to
// every one of them (and every one added later), this mirrors data-tooltip -> aria-label
// automatically, for whatever's on screen now and whatever gets mounted after (modals,
// panels) via a MutationObserver.
export function useAccessibleTooltips(): void {
  useEffect(() => {
    function label(el: Element): void {
      const text = el.getAttribute('data-tooltip')
      if (text && !el.hasAttribute('aria-label')) el.setAttribute('aria-label', text)
    }
    function labelTree(root: ParentNode): void {
      root.querySelectorAll?.('[data-tooltip]').forEach(label)
    }

    labelTree(document.body)

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return
          if (node.hasAttribute('data-tooltip')) label(node)
          labelTree(node)
        })
        if (m.type === 'attributes' && m.target instanceof Element) label(m.target)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-tooltip'] })
    return () => observer.disconnect()
  }, [])
}
