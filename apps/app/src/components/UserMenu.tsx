import { useEffect, useRef, useState } from 'react'

// UX-3 (PROD UX hotfix, 2026-08-30): replaces the old avatar+name+`<details>`
// dropdown with a compact hamburger menu. The menu content is always
// rendered (not conditionally mounted) and toggled purely via the `hidden`
// attribute -- this keeps its items reachable in a static render (matching
// this repo's own test convention of asserting on always-present markup,
// see analysis-workspace-ux.test.ts's header comment: no fireEvent/userEvent
// anywhere here) while still being genuinely inaccessible/untabbable when
// closed, since browsers exclude `[hidden]` content from the tab order on
// their own -- no manual tabindex bookkeeping needed.
type Props = {
  displayName: string
  picture?: string | null
  showSettings: boolean
  settingsLabel: string
  onOpenSettings: () => void
  onLogout: () => void
}

export function UserMenu({ displayName, picture, showSettings, settingsLabel, onOpenSettings, onLogout }: Props) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const menuId = 'user-menu-content'

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector('button')?.focus()
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { setOpen(false); toggleRef.current?.focus() }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function select(action: () => void) {
    setOpen(false)
    action()
  }

  return (
    <div className="user-menu" ref={containerRef}>
      {picture ? <img className="user-avatar" src={picture} alt="" /> : <span className="user-avatar user-avatar-fallback" aria-hidden="true">{displayName.slice(0, 1).toUpperCase()}</span>}
      <span className="user-menu-name">{displayName}</span>
      <button
        type="button"
        ref={toggleRef}
        className="user-menu-toggle"
        aria-label="Menu"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">☰</span>
      </button>
      <div className="user-menu-content" id={menuId} ref={menuRef} hidden={!open}>
        <span className="user-menu-item">Profil</span>
        {showSettings && <button type="button" onClick={() => select(onOpenSettings)}>{settingsLabel}</button>}
        <hr className="user-menu-separator" />
        <button type="button" onClick={() => select(onLogout)}>Wyloguj</button>
      </div>
    </div>
  )
}
