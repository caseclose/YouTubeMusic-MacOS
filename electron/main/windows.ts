import { readFileSync } from 'fs'
import { join } from 'path'
import { app, BrowserWindow, ipcMain } from 'electron'
import {
  type NavigationCommand,
  type NavigationState,
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

  ytmusic-nav-bar {
    padding-left: 218px !important;
    box-sizing: border-box !important;
  }

  ytmusic-nav-bar #guide-button,
  ytmusic-nav-bar ytmusic-guide-button-renderer,
  ytmusic-nav-bar tp-yt-paper-icon-button[aria-label*="Guide"],
  ytmusic-nav-bar yt-icon-button[aria-label*="Guide"] {
    margin-left: 14px !important;
  }

  #ytm-electron-nav-toolbar {
    position: fixed !important;
    top: 12px !important;
    left: 84px !important;
    height: 30px !important;
    display: flex !important;
    align-items: center !important;
    gap: 2px !important;
    padding: 3px !important;
    border-radius: 10px !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    background: rgba(44, 44, 46, 0.72) !important;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.26) !important;
    backdrop-filter: blur(18px) saturate(1.2) !important;
    -webkit-backdrop-filter: blur(18px) saturate(1.2) !important;
    -webkit-app-region: no-drag !important;
    z-index: 2147483646 !important;
  }

  #ytm-electron-nav-toolbar button {
    width: 30px !important;
    height: 24px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 7px !important;
    color: rgba(255, 255, 255, 0.78) !important;
    background: transparent !important;
    font: inherit !important;
    line-height: 1 !important;
    cursor: default !important;
    -webkit-app-region: no-drag !important;
  }

  #ytm-electron-nav-toolbar button:not(:disabled):hover {
    color: rgba(255, 255, 255, 0.96) !important;
    background: rgba(255, 255, 255, 0.12) !important;
  }

  #ytm-electron-nav-toolbar button:disabled {
    color: rgba(255, 255, 255, 0.28) !important;
  }

  #ytm-electron-nav-toolbar svg {
    width: 17px !important;
    height: 17px !important;
    pointer-events: none !important;
    stroke: currentColor !important;
  }

  #ytm-electron-drag-top {
    position: fixed !important;
    top: 0 !important;
    left: 202px !important;
    right: 0 !important;
    height: 14px !important;
    -webkit-app-region: drag !important;
    z-index: 2147483645 !important;
    background: transparent !important;
    pointer-events: auto !important;
  }
`

let navigationIpcRegistered = false

const MINI_PLAYER_CSS = `
  html,
  body {
    width: 100vw !important;
    height: 100vh !important;
    overflow: hidden !important;
    background: #0f0f0f !important;
  }

  #guide-wrapper,
  #guide-content,
  ytmusic-nav-bar,
  #content-wrapper > :not(ytmusic-player-bar),
  #masthead,
  .search-box,
  iron-pages > :not([selected]),
  #player-page,
  ytmusic-browse-response,
  ytmusic-home-page,
  ytmusic-search-page,
  tp-yt-app-drawer {
    display: none !important;
  }

  ytmusic-app,
  ytmusic-app-layout,
  #content,
  #content-wrapper {
    width: 100vw !important;
    height: 100vh !important;
    min-height: 0 !important;
    overflow: hidden !important;
    background: #0f0f0f !important;
  }

  ytmusic-app-layout {
    min-height: 100vh !important;
  }

  ytmusic-player-bar {
    display: block !important;
  }

  ytmusic-player-bar {
    position: fixed !important;
    top: 28px !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 100vw !important;
    height: calc(100vh - 28px) !important;
    min-height: 0 !important;
    box-sizing: border-box !important;
    overflow: hidden !important;
    background: linear-gradient(180deg, #181818 0%, #111 100%) !important;
    border-top: 1px solid rgba(255, 255, 255, 0.08) !important;
    z-index: 9999 !important;
  }

  ytmusic-player-bar *,
  ytmusic-player-bar ::before,
  ytmusic-player-bar ::after {
    box-sizing: border-box !important;
  }

  ytmusic-player-bar #progress-bar,
  ytmusic-player-bar .progress-bar,
  ytmusic-player-bar tp-yt-paper-progress,
  ytmusic-player-bar ytmusic-player-bar-progress {
    position: absolute !important;
    top: 0 !important;
    left: 10px !important;
    right: 10px !important;
    width: auto !important;
    z-index: 2 !important;
  }

  ytmusic-player-bar #main-panel,
  ytmusic-player-bar .main-panel {
    height: 100% !important;
    min-height: 0 !important;
  }

  ytmusic-player-bar .content-info-wrapper,
  ytmusic-player-bar .song-info,
  ytmusic-player-bar #song-info {
    position: absolute !important;
    left: 24px !important;
    right: 24px !important;
    bottom: 86px !important;
    max-width: calc(100vw - 48px) !important;
    min-width: 0 !important;
    overflow: hidden !important;
  }

  ytmusic-player-bar .title,
  ytmusic-player-bar .subtitle,
  ytmusic-player-bar .byline,
  ytmusic-player-bar yt-formatted-string {
    max-width: 100% !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  ytmusic-player-bar .title {
    font-size: 22px !important;
    line-height: 1.25 !important;
    color: #fff !important;
  }

  ytmusic-player-bar .byline,
  ytmusic-player-bar .subtitle {
    font-size: 13px !important;
    color: rgba(255, 255, 255, 0.68) !important;
  }

  ytmusic-player-bar img,
  ytmusic-player-bar #song-image img,
  ytmusic-player-bar .thumbnail-image-wrapper img {
    width: 76px !important;
    height: 76px !important;
    object-fit: cover !important;
    border-radius: 8px !important;
  }

  ytmusic-player-bar #left-controls,
  ytmusic-player-bar .left-controls,
  ytmusic-player-bar #center-controls,
  ytmusic-player-bar .center-controls,
  ytmusic-player-bar .middle-controls {
    position: absolute !important;
    left: 16px !important;
    right: 16px !important;
    bottom: 22px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 14px !important;
    min-width: 0 !important;
  }

  ytmusic-player-bar #right-controls,
  ytmusic-player-bar .right-controls,
  ytmusic-player-bar .volume,
  ytmusic-player-bar .like,
  ytmusic-player-bar .dislike,
  ytmusic-player-bar .repeat,
  ytmusic-player-bar .shuffle,
  ytmusic-player-bar .queue {
    display: none !important;
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

function getNavigationState(win: BrowserWindow | null): NavigationState {
  if (!win || win.isDestroyed()) {
    return { canGoBack: false, canGoForward: false }
  }

  return {
    canGoBack: win.webContents.canGoBack(),
    canGoForward: win.webContents.canGoForward()
  }
}

function sendNavigationState(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  win.webContents.send('navigation:state-changed', getNavigationState(win))
}

function setupNavigationControls(win: BrowserWindow): void {
  if (!navigationIpcRegistered) {
    navigationIpcRegistered = true

    ipcMain.handle('navigation:command', (event, command: NavigationCommand) => {
      const sourceWindow = BrowserWindow.fromWebContents(event.sender)
      if (!sourceWindow || sourceWindow.isDestroyed() || sourceWindow !== mainWindow) {
        return getNavigationState(sourceWindow)
      }

      switch (command) {
        case 'back':
          if (sourceWindow.webContents.canGoBack()) {
            sourceWindow.webContents.goBack()
          }
          break
        case 'forward':
          if (sourceWindow.webContents.canGoForward()) {
            sourceWindow.webContents.goForward()
          }
          break
        case 'reload':
          sourceWindow.webContents.reload()
          break
      }

      sendNavigationState(sourceWindow)
      return getNavigationState(sourceWindow)
    })

    ipcMain.handle('navigation:state', (event) => {
      return getNavigationState(BrowserWindow.fromWebContents(event.sender))
    })
  }

  const broadcast = () => sendNavigationState(win)
  win.webContents.on('did-finish-load', broadcast)
  win.webContents.on('did-navigate', broadcast)
  win.webContents.on('did-navigate-in-page', broadcast)
  win.webContents.on('did-stop-loading', broadcast)
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
        const icons = {
          back: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
          forward: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
          reload: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4"/></svg>'
        };

        const ensureToolbar = () => {
          let toolbar = document.getElementById('ytm-electron-nav-toolbar');
          if (toolbar) return toolbar;

          toolbar = document.createElement('div');
          toolbar.id = 'ytm-electron-nav-toolbar';
          toolbar.setAttribute('aria-label', 'Navigation controls');
          toolbar.innerHTML = [
            ['back', '后退'],
            ['forward', '前进'],
            ['reload', '刷新']
          ].map(([command, label]) => (
            '<button type="button" data-command="' + command + '" aria-label="' + label + '" title="' + label + '">' +
              icons[command] +
            '</button>'
          )).join('');

          toolbar.addEventListener('click', async (event) => {
            const button = event.target.closest('button[data-command]');
            if (!button || button.disabled || !window.ytmBridge?.navigate) return;
            const state = await window.ytmBridge.navigate(button.dataset.command);
            updateToolbarState(state);
          });

          document.body.appendChild(toolbar);
          return toolbar;
        };

        const updateToolbarState = (state) => {
          const toolbar = ensureToolbar();
          const back = toolbar.querySelector('[data-command="back"]');
          const forward = toolbar.querySelector('[data-command="forward"]');
          if (back) back.disabled = !state?.canGoBack;
          if (forward) forward.disabled = !state?.canGoForward;
        };

        ensureToolbar();

        if (window.ytmBridge?.getNavigationState) {
          window.ytmBridge.getNavigationState().then(updateToolbarState).catch(() => {});
        }

        if (window.ytmBridge?.onNavigationState && !window.__ytmNavigationStateListenerInstalled) {
          window.__ytmNavigationStateListenerInstalled = true;
          window.ytmBridge.onNavigationState(updateToolbarState);
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
    const dragBar = `
      if (!document.querySelector('.drag-region')) {
        document.body.insertAdjacentHTML('afterbegin', '<div class="drag-region"></div>');
      }
    `
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

    if (url !== lastInjectedUrl) {
      lastInjectedUrl = url
    }

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
  setupNavigationControls(mainWindow)
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
