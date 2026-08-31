import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { UserMenu } from '../src/components/UserMenu.js'

// UX-3 regression coverage (PROD UX hotfix, 2026-08-30): the old
// avatar+name+`<details>` dropdown is replaced by a compact hamburger menu.
// Static-render structural checks only (this suite never simulates
// click/outside-click/Escape -- see analysis-workspace-ux.test.ts's header
// comment); open/close *behavior* itself is plain DOM event-listener code
// with no branching worth a unit test beyond what TypeScript already
// enforces, so coverage here focuses on the parts that are actually
// data-driven: initial closed state, ARIA wiring, and which items render
// for which role/view. The menu content is intentionally always present in
// the markup (toggled via the `hidden` attribute, not conditional JSX) --
// see UserMenu.tsx's own comment for why.

function noop(): never { throw new Error('not called in this test') }

test('UserMenu: hamburger is visible with the required ARIA wiring, and the menu starts closed', () => {
  const html = renderToStaticMarkup(createElement(UserMenu, {
    displayName: 'Andrzej Miszczuk', picture: null, showSettings: true, settingsLabel: 'Ustawienia', onOpenSettings: noop, onLogout: noop,
  }))
  assert.ok(html.includes('aria-label="Menu"'))
  assert.ok(html.includes('aria-expanded="false"'))
  assert.match(html, /aria-controls="([^"]+)"/)
  const controlsId = html.match(/aria-controls="([^"]+)"/)![1]
  assert.ok(html.includes(`id="${controlsId}"`), 'aria-controls must point at the id of the actual menu content element')
  assert.match(html, new RegExp(`id="${controlsId}"[^>]*hidden`), 'the menu content must be hidden by default')
})

test('UserMenu: no old dropdown/summary markup remains', () => {
  const html = renderToStaticMarkup(createElement(UserMenu, {
    displayName: 'Andrzej Miszczuk', picture: null, showSettings: true, settingsLabel: 'Ustawienia', onOpenSettings: noop, onLogout: noop,
  }))
  assert.equal(html.includes('<details'), false)
  assert.equal(html.includes('<summary'), false)
})

test('UserMenu: shows Profil, Ustawienia and Wyloguj with a separator before Wyloguj, for a role that can see Settings', () => {
  const html = renderToStaticMarkup(createElement(UserMenu, {
    displayName: 'Andrzej Miszczuk', picture: null, showSettings: true, settingsLabel: 'Ustawienia', onOpenSettings: noop, onLogout: noop,
  }))
  assert.ok(html.includes('Profil'))
  assert.ok(html.includes('Ustawienia'))
  assert.ok(html.includes('Wyloguj'))
  const separatorIndex = html.indexOf('user-menu-separator')
  const logoutIndex = html.indexOf('>Wyloguj<')
  assert.ok(separatorIndex > 0 && separatorIndex < logoutIndex, 'the separator must render immediately before Wyloguj')
})

test('UserMenu: hides Ustawienia for a role without settings access (e.g. OBSERVER), but still shows Profil and Wyloguj', () => {
  const html = renderToStaticMarkup(createElement(UserMenu, {
    displayName: 'Jan Nowak', picture: null, showSettings: false, settingsLabel: 'Ustawienia', onOpenSettings: noop, onLogout: noop,
  }))
  assert.ok(html.includes('Profil'))
  assert.ok(html.includes('Wyloguj'))
  assert.equal(html.includes('Ustawienia'), false)
})

test('UserMenu: reflects the caller-provided settings label (toggles to "Moje analizy" while already in Settings)', () => {
  const html = renderToStaticMarkup(createElement(UserMenu, {
    displayName: 'Andrzej Miszczuk', picture: null, showSettings: true, settingsLabel: 'Moje analizy', onOpenSettings: noop, onLogout: noop,
  }))
  assert.ok(html.includes('>Moje analizy<'))
  assert.equal(html.includes('>Ustawienia<'), false)
})

test('UserMenu: renders the picture when present, otherwise an initial-letter fallback avatar', () => {
  const withPicture = renderToStaticMarkup(createElement(UserMenu, {
    displayName: 'Andrzej Miszczuk', picture: 'https://example.test/avatar.png', showSettings: true, settingsLabel: 'Ustawienia', onOpenSettings: noop, onLogout: noop,
  }))
  assert.ok(withPicture.includes('src="https://example.test/avatar.png"'))

  const withoutPicture = renderToStaticMarkup(createElement(UserMenu, {
    displayName: 'Andrzej Miszczuk', picture: null, showSettings: true, settingsLabel: 'Ustawienia', onOpenSettings: noop, onLogout: noop,
  }))
  assert.ok(withoutPicture.includes('>A<'), 'fallback avatar shows the first letter of the display name')
})
