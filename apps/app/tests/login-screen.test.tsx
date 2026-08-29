import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LoginScreen } from '../src/components/LoginScreen.js'

const render = (development: boolean, state: 'idle' | 'access_denied' | 'provider_error' | 'session_expired' = 'idle') => renderToStaticMarkup(
  createElement(LoginScreen, { apiBaseUrl: '/api', development, state, onDevLogin: async () => undefined }),
)

test('Google and Microsoft login CTAs are both visible and DEV controls are initially collapsed', () => {
  const html = render(true)
  assert.match(html, /Kontynuuj z Google/)
  assert.match(html, /Kontynuuj z Microsoft/)
  assert.match(html, /Opcje deweloperskie/)
  assert.doesNotMatch(html, /Zaloguj lokalnie/)
})

test('DEV controls are absent in production and login failures are safe', () => {
  assert.doesNotMatch(render(false), /Opcje deweloperskie/)
  assert.match(render(false, 'access_denied'), /nie ma dostępu do aplikacji/)
  assert.match(render(false, 'provider_error'), /Spróbuj ponownie/)
  assert.match(render(false, 'session_expired'), /Sesja wygasła/)
})
