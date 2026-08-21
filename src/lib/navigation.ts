import { createContext, useContext } from 'react'

export const PathContext = createContext(typeof window === 'undefined' ? '/' : window.location.pathname)

export function usePathname() {
  return useContext(PathContext)
}

export function navigate(path: string) {
  if (path !== window.location.pathname) {
    window.history.pushState({}, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
}
