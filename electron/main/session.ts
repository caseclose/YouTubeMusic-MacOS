import { join } from 'path'
import { app, session, shell, BrowserWindow } from 'electron'
import { SESSION_PARTITION } from '../types'
import {
  applyWebContentsSpoofing,
  CHROME_UA,
  configureSessionSpoofing,
  isGoogleAuthRequest,
  loadUrl
} from './browser-spoof'

const ALLOWED_HOSTS = [
  'music.youtube.com',
  'www.youtube.com',
  'youtube.com',
  'm.youtube.com',
  'consent.youtube.com',
  'consent.google.com',
  'accounts.google.com',
  'accounts.youtube.com',
  'myaccount.google.com',
  'www.google.com',
  'google.com',
  'gstatic.com',
  'googleusercontent.com'
]

export function configureSession(): void {
  configureSessionSpoofing()

  const ses = session.fromPartition(SESSION_PARTITION)

  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['notifications', 'media', 'fullscreen', 'pointerLock']
    callback(allowed.includes(permission))
  })
}

function getHostname(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

export function isAllowedAuthUrl(url: string): boolean {
  if (!url || url === 'about:blank') return false
  const host = getHostname(url)
  if (!host) return false
  return ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
}

export function isLoginPopupUrl(url: string): boolean {
  if (!url || url === 'about:blank') return true
  return (
    isGoogleAuthRequest(url) ||
    url.includes('ServiceLogin') ||
    url.includes('accounts.google.com') ||
    url.includes('youtube.com/signin') ||
    url.includes('google.com/signin')
  )
}

function getPreloadPath(): string {
  return join(__dirname, '../preload/index.js')
}

function setupAuthWindow(authWin: BrowserWindow, parent: BrowserWindow): void {
  authWin.webContents.setUserAgent(CHROME_UA)
  applyWebContentsSpoofing(authWin.webContents)

  const finishAuth = (targetUrl: string) => {
    if (!targetUrl.includes('music.youtube.com')) return
    if (!parent.isDestroyed()) {
      loadUrl(parent.webContents, targetUrl)
      parent.show()
      parent.focus()
    }
    if (!authWin.isDestroyed()) {
      authWin.close()
    }
  }

  authWin.webContents.on('will-redirect', (_event, targetUrl) => finishAuth(targetUrl))
  authWin.webContents.on('did-navigate', (_event, targetUrl) => finishAuth(targetUrl))
}

export function setupWindowOpenHandler(parent: BrowserWindow): void {
  parent.webContents.setWindowOpenHandler(({ url }) => {
    if (isLoginPopupUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 500,
          height: 720,
          parent,
          modal: true,
          show: true,
          title: '登录 Google 账号',
          webPreferences: {
            partition: SESSION_PARTITION,
            preload: getPreloadPath(),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
          }
        }
      }
    }

    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }

    return { action: 'deny' }
  })

  parent.webContents.on('did-create-window', (childWindow, { url }) => {
    if (!isLoginPopupUrl(url) && url !== 'about:blank') return
    setupAuthWindow(childWindow, parent)
  })
}

export function setupNavigationGuards(win: BrowserWindow): void {
  win.webContents.on('will-navigate', (event, url) => {
    if (isAllowedAuthUrl(url)) return
    event.preventDefault()
    shell.openExternal(url)
  })
}

app.on('web-contents-created', (_event, contents) => {
  applyWebContentsSpoofing(contents)

  contents.setWindowOpenHandler(({ url }) => {
    if (isLoginPopupUrl(url)) {
      return { action: 'allow' }
    }
    if (url.startsWith('http')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  contents.on('will-navigate', (event, url) => {
    if (isAllowedAuthUrl(url)) return
    const current = contents.getURL()
    if (current.includes('music.youtube.com') || current.includes('youtube.com')) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })
})
