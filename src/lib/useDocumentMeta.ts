import { useEffect } from 'react'

export function useDocumentMeta(title: string, description: string) {
  useEffect(() => {
    const previousTitle = document.title
    document.title = title

    let meta = document.querySelector('meta[name="description"]')
    const previousDescription = meta?.getAttribute('content') ?? null
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'description')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', description)

    return () => {
      document.title = previousTitle
      if (previousDescription === null) meta?.remove()
      else meta?.setAttribute('content', previousDescription)
    }
  }, [title, description])
}
