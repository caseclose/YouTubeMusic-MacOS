import { readFileSync } from 'fs'
import { join } from 'path'
import { app, BrowserWindow, ipcMain } from 'electron'
import {
  SESSION_PARTITION,
  YTM_URL,
  type PlayerState
} from '../types'
import { applyWebContentsSpoofing, CHROME_UA, loadUrl } from './browser-spoof'
import { registerPlayerWindow } from './player-control'
import { setupNavigationGuards, setupWindowOpenHandler } from './session'
import { getIsQuitting } from './app-state'

let mainWindow: BrowserWindow | null = null
let miniPlayerWindow: BrowserWindow | null = null

const MAIN_WINDOW_DRAG_CSS = `
  ytmusic-nav-bar {
    -webkit-app-region: drag !important;
  }

  ytmusic-nav-bar a,
  ytmusic-nav-bar button,
  ytmusic-nav-bar input,
  ytmusic-nav-bar textarea,
  ytmusic-nav-bar tp-yt-paper-icon-button,
  ytmusic-nav-bar ytmusic-search-box,
  ytmusic-nav-bar ytmusic-search-box *,
  ytmusic-nav-bar .search-box,
  ytmusic-nav-bar .center-content,
  ytmusic-nav-bar .right-content,
  ytmusic-nav-bar yt-icon-button,
  ytmusic-nav-bar [role="button"],
  ytmusic-nav-bar [role="searchbox"] {
    -webkit-app-region: no-drag !important;
  }

  #ytm-electron-drag-left {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 84px !important;
    height: 52px !important;
    -webkit-app-region: drag !important;
    z-index: 2147483646 !important;
    background: transparent !important;
  }

  #ytm-electron-drag-top {
    position: fixed !important;
    top: 0 !important;
    left: 84px !important;
    right: 0 !important;
    height: 14px !important;
    -webkit-app-region: drag !important;
    z-index: 2147483645 !important;
    background: transparent !important;
    pointer-events: auto !important;
  }
`

const MINI_PLAYER_CSS = `
  #guide-wrapper,
  #guide-content,
  ytmusic-nav-bar,
  #content-wrapper > :not(ytmusic-player-bar):not(#player-page),
  #masthead,
  .search-box,
  iron-pages > :not([selected]),
  ytmusic-browse-response,
  ytmusic-home-page,
  ytmusic-search-page,
  tp-yt-app-drawer {
    display: none !important;
  }
  body {
    overflow: hidden !important;
    background: #0f0f0f !important;
  }
  ytmusic-app-layout {
    min-height: 100vh !important;
  }
  #player-page,
  ytmusic-player-bar {
    display: block !important;
  }
  ytmusic-player-bar {
    position: fixed !important;
    bottom: 0 !important;
    left: 0 !important;
    right: 0 !important;
    z-index: 9999 !important;
  }
  .drag-region {
    -webkit-app-region: drag;
    height: 28px;
    background: #1a1a1a;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 10000;
  }
`

function getPreloadPath(): string {
  return join(__dirname, '../preload/index.js')
}

function getInjectScript(): string {
  const paths = [
    join(__dirname, '../../resources/inject/player-bridge.js'),
    join(process.resourcesPath, 'inject/player-bridge.js'),
    join(app.getAppPath(), 'resources/inject/player-bridge.js')
  ]

  for (const path of paths) {
    try {
      return readFileSync(path, 'utf-8')
    } catch {
      // try next path
    }
  }

  console.warn('player-bridge.js not found, media integration may not work')
  return ''
}

function createBaseWebPreferences() {
  return {
    partition: SESSION_PARTITION,
    preload: getPreloadPath(),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
    webSecurity: true
  }
}

async function injectPlayerBridge(win: BrowserWindow, mode: 'main' | 'mini' = 'main'): Promise<void> {
  const script = getInjectScript()
  if (!script) return

  try {
    await win.webContents.executeJavaScript(
      `(${script})(${JSON.stringify(mode)});`,
      true
    )
  } catch (err) {
    console.error('Failed to inject player bridge:', err)
  }
}

async function injectMainWindowDragRegion(win: BrowserWindow): Promise<void> {
  try {
    await win.webContents.insertCSS(MAIN_WINDOW_DRAG_CSS)
    await win.webContents.executeJavaScript(
      `
      (() => {
        if (!document.getElementById('ytm-electron-drag-left')) {
          const left = document.createElement('div');
          left.id = 'ytm-electron-drag-left';
          document.body.appendChild(left);
        }
        if (!document.getElementById('ytm-electron-drag-top')) {
          const top = document.createElement('div');
          top.id = 'ytm-electron-drag-top';
          document.body.appendChild(top);
        }
      })();
    `,
      true
    )
  } catch (err) {
    console.error('Failed to inject drag region:', err)
  }
}

async function injectMiniPlayerStyles(win: BrowserWindow): Promise<void> {
  try {
    const dragBar = `document.body.insertAdjacentHTML('afterbegin', '<div class="drag-region"></div>');`
    await win.webContents.insertCSS(MINI_PLAYER_CSS)
    await win.webContents.executeJavaScript(dragBar, true)
  } catch (err) {
    console.error('Failed to inject mini player styles:', err)
  }
}

function setupPlayerBridgeInjection(win: BrowserWindow, mode: 'main' | 'mini'): void {
  let lastInjectedUrl = ''

  const reinject = async () => {
    const url = win.webContents.getURL()
    if (!url.includes('music.youtube.com')) return
    if (url === lastInjectedUrl) return
    lastInjectedUrl = url

    await injectPlayerBridge(win, mode)
    if (mode === 'main') {
      await injectMainWindowDragRegion(win)
    }
    if (mode === 'mini') {
      await injectMiniPlayerStyles(win)
    }
  }

  win.webContents.on('did-finish-load', reinject)
  win.webContents.on('did-navigate-in-page', reinject)
}

export function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    return mainWindow
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'YouTube Music',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    show: false,
    webPreferences: createBaseWebPreferences()
  })

  mainWindow.webContents.setUserAgent(CHROME_UA)
  applyWebContentsSpoofing(mainWindow.webContents)
  setupWindowOpenHandler(mainWindow)
  setupNavigationGuards(mainWindow)
  setupPlayerBridgeInjection(mainWindow, 'main')
  registerPlayerWindow(mainWindow)

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', (event) => {
    if (getIsQuitting()) return
    event.preventDefault()
    mainWindow?.hide()
  })

  loadUrl(mainWindow.webContents, YTM_URL)

  if (process.env.YTM_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  return mainWindow
}

export function createMiniPlayerWindow(): BrowserWindow {
  if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
    miniPlayerWindow.show()
    miniPlayerWindow.focus()
    return miniPlayerWindow
  }

  miniPlayerWindow = new BrowserWindow({
    width: 420,
    height: 280,
    minWidth: 360,
    minHeight: 220,
    title: 'Mini Player',
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    show: false,
    transparent: false,
    backgroundColor: '#0f0f0f',
    webPreferences: createBaseWebPreferences()
  })

  miniPlayerWindow.webContents.setUserAgent(CHROME_UA)
  applyWebContentsSpoofing(miniPlayerWindow.webContents)
  setupPlayerBridgeInjection(miniPlayerWindow, 'mini')
  registerPlayerWindow(miniPlayerWindow)

  miniPlayerWindow.once('ready-to-show', () => {
    miniPlayerWindow?.show()
  })

  miniPlayerWindow.on('closed', () => {
    miniPlayerWindow = null
  })

  loadUrl(miniPlayerWindow.webContents, YTM_URL)

  return miniPlayerWindow
}

export function toggleMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow()
    return
  }

  if (mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
    mainWindow.show()
    mainWindow.focus()
  }
}

export function toggleMiniPlayer(): void {
  if (miniPlayerWindow && !miniPlayerWindow.isDestroyed() && miniPlayerWindow.isVisible()) {
    miniPlayerWindow.hide()
    return
  }

  createMiniPlayerWindow()
}

export function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow()
    return
  }
  mainWindow.show()
  mainWindow.focus()
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function getMiniPlayerWindow(): BrowserWindow | null {
  return miniPlayerWindow
}

export function setupPlayerStateIpc(
  onStateChange: (state: PlayerState) => void
): void {
  ipcMain.on('player:state', (_event, state: PlayerState) => {
    onStateChange(state)
  })
}
