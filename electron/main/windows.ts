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
  #content-wrapper,
  #masthead,
  .search-box,
  iron-pages,
  #player-page,
  ytmusic-player-bar,
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

  #ytm-electron-mini-player {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    display: flex !important;
    flex-direction: column !important;
    box-sizing: border-box !important;
    padding: 34px 22px 16px !important;
    overflow: hidden !important;
    color: #fff !important;
    background:
      radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.08), transparent 34%),
      linear-gradient(180deg, #1b1b1b 0%, #101010 100%) !important;
    z-index: 9999 !important;
    -webkit-app-region: no-drag !important;
  }

  #ytm-electron-mini-player * {
    box-sizing: border-box !important;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif !important;
  }

  #ytm-electron-mini-player .mini-content {
    flex: 1 !important;
    min-height: 0 !important;
    display: flex !important;
    flex-direction: column !important;
  }

  #ytm-electron-mini-player .mini-art {
    width: min(96px, 28vw) !important;
    height: min(96px, 28vw) !important;
    margin: 0 auto 12px !important;
    border-radius: 14px !important;
    overflow: hidden !important;
    background: rgba(255, 255, 255, 0.08) !important;
    box-shadow: 0 14px 34px rgba(0, 0, 0, 0.38) !important;
    -webkit-app-region: no-drag !important;
  }

  #ytm-electron-mini-player .mini-art img {
    width: 100% !important;
    height: 100% !important;
    display: block !important;
    object-fit: cover !important;
  }

  #ytm-electron-mini-player .mini-fallback {
    width: 100% !important;
    height: 100% !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    color: rgba(255, 255, 255, 0.6) !important;
    font-size: 34px !important;
  }

  #ytm-electron-mini-player .mini-title,
  #ytm-electron-mini-player .mini-artist {
    text-align: center !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }

  #ytm-electron-mini-player .mini-title {
    min-height: 26px !important;
    font-size: 21px !important;
    line-height: 1.25 !important;
    font-weight: 700 !important;
    letter-spacing: -0.02em !important;
  }

  #ytm-electron-mini-player .mini-artist {
    min-height: 18px !important;
    margin-top: 2px !important;
    color: rgba(255, 255, 255, 0.66) !important;
    font-size: 13px !important;
    line-height: 1.35 !important;
  }

  #ytm-electron-mini-player .mini-progress {
    position: relative !important;
    height: 16px !important;
    margin: 14px 0 5px !important;
    -webkit-app-region: no-drag !important;
  }

  #ytm-electron-mini-player .mini-progress-fill {
    position: absolute !important;
    top: 5px !important;
    left: 0 !important;
    height: 6px !important;
    border-radius: 999px !important;
    background: rgba(255, 255, 255, 0.86) !important;
    pointer-events: none !important;
    z-index: 1 !important;
  }

  #ytm-electron-mini-player .mini-progress input {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    height: 16px !important;
    margin: 0 !important;
    appearance: none !important;
    -webkit-appearance: none !important;
    background: transparent !important;
    cursor: pointer !important;
    -webkit-app-region: no-drag !important;
    z-index: 2 !important;
  }

  #ytm-electron-mini-player .mini-progress input::-webkit-slider-runnable-track {
    height: 6px !important;
    border-radius: 999px !important;
    background: rgba(255, 255, 255, 0.22) !important;
  }

  #ytm-electron-mini-player .mini-progress input::-webkit-slider-thumb {
    width: 14px !important;
    height: 14px !important;
    margin-top: -4px !important;
    border: 0 !important;
    border-radius: 999px !important;
    appearance: none !important;
    -webkit-appearance: none !important;
    background: rgba(255, 255, 255, 0.96) !important;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35) !important;
  }

  #ytm-electron-mini-player .mini-time {
    display: flex !important;
    justify-content: space-between !important;
    color: rgba(255, 255, 255, 0.52) !important;
    font-size: 11px !important;
    font-variant-numeric: tabular-nums !important;
  }

  #ytm-electron-mini-player .mini-controls {
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 16px !important;
    margin-top: auto !important;
    -webkit-app-region: no-drag !important;
  }

  #ytm-electron-mini-player .mini-volume {
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
    width: min(180px, 58vw) !important;
    margin: 8px auto 0 !important;
    color: rgba(255, 255, 255, 0.46) !important;
    opacity: 0.72 !important;
    -webkit-app-region: no-drag !important;
  }

  #ytm-electron-mini-player .mini-volume:hover {
    color: rgba(255, 255, 255, 0.72) !important;
    opacity: 1 !important;
  }

  #ytm-electron-mini-player .mini-volume svg {
    width: 14px !important;
    height: 14px !important;
    flex: 0 0 auto !important;
    fill: currentColor !important;
  }

  #ytm-electron-mini-player .mini-volume input {
    flex: 1 !important;
    min-width: 0 !important;
    height: 12px !important;
    margin: 0 !important;
    appearance: none !important;
    -webkit-appearance: none !important;
    background: transparent !important;
    cursor: pointer !important;
    -webkit-app-region: no-drag !important;
  }

  #ytm-electron-mini-player .mini-volume input::-webkit-slider-runnable-track {
    height: 4px !important;
    border-radius: 999px !important;
    background: rgba(255, 255, 255, 0.28) !important;
  }

  #ytm-electron-mini-player .mini-volume input::-webkit-slider-thumb {
    width: 12px !important;
    height: 12px !important;
    margin-top: -4px !important;
    border: 0 !important;
    border-radius: 999px !important;
    appearance: none !important;
    -webkit-appearance: none !important;
    background: rgba(255, 255, 255, 0.88) !important;
  }

  #ytm-electron-mini-player button {
    width: 38px !important;
    height: 38px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 999px !important;
    color: rgba(255, 255, 255, 0.88) !important;
    background: transparent !important;
    -webkit-app-region: no-drag !important;
  }

  #ytm-electron-mini-player button:hover {
    background: rgba(255, 255, 255, 0.1) !important;
  }

  #ytm-electron-mini-player button.is-active {
    color: #fff !important;
    background: rgba(255, 255, 255, 0.18) !important;
  }

  #ytm-electron-mini-player button:disabled {
    opacity: 0.32 !important;
    cursor: default !important;
  }

  #ytm-electron-mini-player button:disabled:hover {
    background: transparent !important;
  }

  #ytm-electron-mini-player button[data-action="playPause"] {
    width: 50px !important;
    height: 50px !important;
    color: #111 !important;
    background: rgba(255, 255, 255, 0.92) !important;
  }

  #ytm-electron-mini-player svg {
    width: 21px !important;
    height: 21px !important;
    fill: currentColor !important;
    pointer-events: none !important;
  }

  #ytm-electron-mini-player .mini-loading {
    flex: 1 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    color: rgba(255, 255, 255, 0.54) !important;
    font-size: 13px !important;
  }

  #ytm-electron-mini-player.has-track .mini-loading {
    display: none !important;
  }

  #ytm-electron-mini-player:not(.has-track) .mini-content {
    display: none !important;
  }

  .drag-region {
    -webkit-app-region: drag;
    height: 28px;
    background: rgba(255, 255, 255, 0.04);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
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
    const miniPlayerUi = `
      (() => {
        if (!document.querySelector('.drag-region')) {
          document.body.insertAdjacentHTML('afterbegin', '<div class="drag-region"></div>');
        }

        const icons = {
          previous: '<svg viewBox="0 0 24 24"><path d="M6 5h2v14H6V5Zm3.5 7L19 5.5v13L9.5 12Z"/></svg>',
          play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5Z"/></svg>',
          pause: '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7V5Zm6 0h4v14h-4V5Z"/></svg>',
          next: '<svg viewBox="0 0 24 24"><path d="M16 5h2v14h-2V5ZM5 18.5v-13l9.5 6.5L5 18.5Z"/></svg>',
          like: '<svg viewBox="0 0 24 24"><path d="M2 21h4V9H2v12Zm20-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L13.17 1 6.59 7.59C6.22 7.95 6 8.45 6 9v10c0 1.1.9 2 2 2h9c.82 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2Z"/></svg>',
          dislike: '<svg viewBox="0 0 24 24"><path d="M22 3h-4v12h4V3ZM2 14c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L10.83 23l6.58-6.59c.37-.36.59-.86.59-1.41V5c0-1.1-.9-2-2-2H7c-.82 0-1.54.5-1.84 1.22L2.14 11.27c-.09.23-.14.47-.14.73v2Z"/></svg>',
          volume: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4Zm12.5 3a4.5 4.5 0 0 0-2.2-3.87v7.74A4.5 4.5 0 0 0 16.5 12Zm-2.2-8.3v2.08a7 7 0 0 1 0 12.44v2.08a9 9 0 0 0 0-16.6Z"/></svg>'
        };

        const MINI_PLAYER_UI_VERSION = '2026-07-03-seek-range-muted-volume';
        const thumbnailCache = {
          key: '',
          url: '',
          lastDeepScanAt: 0
        };

        function ensureMiniPlayer() {
          let root = document.getElementById('ytm-electron-mini-player');
          if (root?.dataset.uiVersion === MINI_PLAYER_UI_VERSION && root.querySelector('.mini-volume')) {
            return root;
          }

          if (root) {
            root.remove();
          }

          root = document.createElement('div');
          root.id = 'ytm-electron-mini-player';
          root.dataset.uiVersion = MINI_PLAYER_UI_VERSION;
          root.innerHTML =
            '<div class="mini-loading">等待 YouTube Music 播放状态...</div>' +
            '<div class="mini-content">' +
              '<div class="mini-art"><div class="mini-fallback">♪</div><img alt="" hidden /></div>' +
              '<div class="mini-title">YouTube Music</div>' +
              '<div class="mini-artist"></div>' +
              '<div class="mini-progress"><div class="mini-progress-fill"></div><input type="range" min="0" max="1000" value="0" aria-label="播放进度" /></div>' +
              '<div class="mini-time"><span data-role="position">0:00</span><span data-role="duration">0:00</span></div>' +
              '<div class="mini-controls">' +
                '<button type="button" data-action="previous" aria-label="上一首">' + icons.previous + '</button>' +
                '<button type="button" data-action="playPause" aria-label="播放/暂停">' + icons.play + '</button>' +
                '<button type="button" data-action="next" aria-label="下一首">' + icons.next + '</button>' +
                '<button type="button" data-action="like" aria-label="点赞">' + icons.like + '</button>' +
                '<button type="button" data-action="dislike" aria-label="点踩">' + icons.dislike + '</button>' +
              '</div>' +
              '<label class="mini-volume">' +
                icons.volume +
                '<input type="range" min="0" max="100" value="100" aria-label="音量" />' +
              '</label>' +
            '</div>';

          root.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-action]');
            if (!button) return;
            handleControl(button.dataset.action);
          });

          const seek = root.querySelector('.mini-progress input');
          seek.addEventListener('input', () => {
            const video = getVideo();
            if (!video || !video.duration || !Number.isFinite(video.duration)) return;
            const ratio = Math.min(1, Math.max(0, Number(seek.value) / 1000));
            video.currentTime = ratio * video.duration;
            updateMiniPlayer();
          });

          const volume = root.querySelector('.mini-volume input');
          volume.addEventListener('input', () => {
            const video = getVideo();
            if (!video) return;
            video.volume = Math.min(1, Math.max(0, Number(volume.value) / 100));
            video.muted = video.volume === 0;
          });

          document.body.appendChild(root);
          return root;
        }

        function queryButton(selectors) {
          for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) return el;
          }
          return null;
        }

        function clickButton(selectors) {
          const button = queryButton(selectors);
          if (!button) return false;
          button.click();
          return true;
        }

        function getVideo() {
          return document.querySelector('video');
        }

        function textFrom(selectors) {
          const el = queryButton(selectors);
          return el?.textContent?.trim() || '';
        }

        function getTitle() {
          return textFrom([
            'ytmusic-player-bar .title',
            'ytmusic-player-bar a.yt-simple-endpoint',
            '.ytmusic-player-bar .title'
          ]) || document.title.replace(' - YouTube Music', '').trim();
        }

        function getArtist() {
          return textFrom([
            'ytmusic-player-bar .byline',
            'ytmusic-player-bar .subtitle',
            'ytmusic-player-bar yt-formatted-string.byline'
          ]);
        }

        function cacheThumbnail(trackKey, url) {
          thumbnailCache.key = trackKey;
          thumbnailCache.url = url || '';
          return thumbnailCache.url;
        }

        function getThumbnail(trackKey) {
          if (thumbnailCache.key !== trackKey) {
            thumbnailCache.key = trackKey;
            thumbnailCache.url = '';
            thumbnailCache.lastDeepScanAt = 0;
          }

          const mediaSessionArtwork = navigator.mediaSession?.metadata?.artwork;
          if (mediaSessionArtwork?.length) {
            const sorted = Array.from(mediaSessionArtwork).sort((a, b) => {
              const aSize = Number.parseInt(a.sizes || '0', 10) || 0;
              const bSize = Number.parseInt(b.sizes || '0', 10) || 0;
              return bSize - aSize;
            });
            if (sorted[0]?.src) return cacheThumbnail(trackKey, sorted[0].src);
          }

          const directImg = queryButton([
            'ytmusic-player-bar #song-image img',
            'ytmusic-player-bar .thumbnail-image-wrapper img',
            'ytmusic-player-bar yt-img-shadow img',
            'ytmusic-player-bar img',
            '#player-bar-background img',
            '.ytmusic-player-bar img'
          ]);
          const directUrl = directImg?.currentSrc || directImg?.src || directImg?.getAttribute('src');
          if (directUrl) return cacheThumbnail(trackKey, directUrl);

          if (thumbnailCache.url) {
            return thumbnailCache.url;
          }

          const now = Date.now();
          if (now - thumbnailCache.lastDeepScanAt < 5000) {
            return '';
          }
          thumbnailCache.lastDeepScanAt = now;

          const nodes = [];
          const visit = (root) => {
            root.querySelectorAll?.('*').forEach((node) => {
              nodes.push(node);
              if (node.shadowRoot) visit(node.shadowRoot);
            });
          };
          visit(document);

          const candidates = nodes.flatMap((node) => {
            const urls = [];
            if (node instanceof HTMLImageElement) {
              urls.push(node.currentSrc, node.src, node.getAttribute('src'), node.getAttribute('data-thumb'));
            }
            const background = getComputedStyle(node).backgroundImage;
            const match = background && background.match(/url\\(["']?([^"')]+)["']?\\)/);
            if (match?.[1]) urls.push(match[1]);
            return urls;
          }).filter((src) => src && (src.includes('ytimg.com') || src.includes('googleusercontent.com')));

          return cacheThumbnail(trackKey, candidates[0] || '');
        }

        function getFeedbackButton(kind) {
          const positive = kind === 'like';
          const selectors = positive
            ? [
                'ytmusic-player-bar button[aria-label*="Like"]',
                'ytmusic-player-bar tp-yt-paper-icon-button[aria-label*="Like"]',
                'ytmusic-player-bar button[aria-label*="赞"]',
                'ytmusic-player-bar tp-yt-paper-icon-button[aria-label*="赞"]'
              ]
            : [
                'ytmusic-player-bar button[aria-label*="Dislike"]',
                'ytmusic-player-bar tp-yt-paper-icon-button[aria-label*="Dislike"]',
                'ytmusic-player-bar button[aria-label*="不喜欢"]',
                'ytmusic-player-bar tp-yt-paper-icon-button[aria-label*="不喜欢"]',
                'ytmusic-player-bar button[aria-label*="踩"]',
                'ytmusic-player-bar tp-yt-paper-icon-button[aria-label*="踩"]'
              ];

          return queryButton(selectors);
        }

        function isFeedbackActive(kind) {
          const button = getFeedbackButton(kind);
          if (!button) return false;
          const pressed = button.getAttribute('aria-pressed');
          if (pressed) return pressed === 'true';

          const label = (button.getAttribute('aria-label') || '').toLowerCase();
          if (kind === 'like') {
            return label.includes('liked') || label.includes('已赞') || label.includes('取消赞');
          }
          return label.includes('disliked') || label.includes('已踩') || label.includes('取消不喜欢');
        }

        function formatTime(seconds) {
          if (!seconds || !Number.isFinite(seconds)) return '0:00';
          const whole = Math.max(0, Math.floor(seconds));
          const minutes = Math.floor(whole / 60);
          const rest = String(whole % 60).padStart(2, '0');
          return minutes + ':' + rest;
        }

        function getState() {
          const video = getVideo();
          const title = getTitle();
          const artist = getArtist();
          const trackKey = \`\${title}\\n\${artist}\`;
          const likeButton = getFeedbackButton('like');
          const dislikeButton = getFeedbackButton('dislike');

          return {
            title,
            artist,
            thumbnail: getThumbnail(trackKey),
            isPlaying: video ? !video.paused && !video.ended : false,
            duration: video?.duration && Number.isFinite(video.duration) ? video.duration : 0,
            position: video?.currentTime && Number.isFinite(video.currentTime) ? video.currentTime : 0,
            volume: video ? video.volume : 1,
            canLike: Boolean(likeButton),
            canDislike: Boolean(dislikeButton),
            liked: isFeedbackActive('like'),
            disliked: isFeedbackActive('dislike')
          };
        }

        function handleControl(action) {
          const video = getVideo();

          if (action === 'playPause') {
            if (video) {
              if (video.paused) video.play().catch(() => {});
              else video.pause();
            } else {
              clickButton([
                'button[aria-label*="Pause"]',
                'button[aria-label*="Play"]',
                'tp-yt-paper-icon-button.play-pause-button',
                '#play-pause-button'
              ]);
            }
            return;
          }

          if (action === 'next') {
            clickButton([
              'button[aria-label*="Next"]',
              'button[aria-label*="next"]',
              '.next-button',
              'tp-yt-paper-icon-button.next'
            ]);
            return;
          }

          if (action === 'previous') {
            clickButton([
              'button[aria-label*="Previous"]',
              'button[aria-label*="previous"]',
              '.previous-button',
              'tp-yt-paper-icon-button.previous'
            ]);
            return;
          }

          if (action === 'like' || action === 'dislike') {
            getFeedbackButton(action)?.click();
            setTimeout(updateMiniPlayer, 120);
          }
        }

        function updateMiniPlayer() {
          const root = ensureMiniPlayer();
          const state = getState();
          const hasTrack = Boolean(state.title && state.title !== 'YouTube Music');
          root.classList.toggle('has-track', hasTrack);

          root.querySelector('.mini-title').textContent = state.title || 'YouTube Music';
          root.querySelector('.mini-artist').textContent = state.artist || '';
          root.querySelector('[data-role="position"]').textContent = formatTime(state.position);
          root.querySelector('[data-role="duration"]').textContent = formatTime(state.duration);
          const progressRatio = state.duration > 0 ? Math.min(1, state.position / state.duration) : 0;
          root.querySelector('.mini-progress-fill').style.width = (progressRatio * 100) + '%';
          const seek = root.querySelector('.mini-progress input');
          if (document.activeElement !== seek) {
            seek.value = String(Math.round(progressRatio * 1000));
          }

          const image = root.querySelector('.mini-art img');
          const fallback = root.querySelector('.mini-fallback');
          if (state.thumbnail) {
            image.hidden = false;
            image.src = state.thumbnail;
            fallback.style.display = 'none';
          } else {
            image.hidden = true;
            image.removeAttribute('src');
            fallback.style.display = 'flex';
          }

          const playButton = root.querySelector('[data-action="playPause"]');
          playButton.innerHTML = state.isPlaying ? icons.pause : icons.play;

          const volume = root.querySelector('.mini-volume input');
          if (document.activeElement !== volume) {
            volume.value = String(Math.round(state.volume * 100));
          }

          root.querySelector('[data-action="like"]').classList.toggle('is-active', state.liked);
          root.querySelector('[data-action="dislike"]').classList.toggle('is-active', state.disliked);
          root.querySelector('[data-action="like"]').disabled = !state.canLike;
          root.querySelector('[data-action="dislike"]').disabled = !state.canDislike;
        }

        ensureMiniPlayer();
        updateMiniPlayer();

        if (!window.__ytmMiniPlayerInterval) {
          window.__ytmMiniPlayerInterval = window.setInterval(updateMiniPlayer, 500);
        }
      })();
    `
    await win.webContents.insertCSS(MINI_PLAYER_CSS)
    await win.webContents.executeJavaScript(miniPlayerUi, true)
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
    height: 320,
    minWidth: 360,
    minHeight: 300,
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
