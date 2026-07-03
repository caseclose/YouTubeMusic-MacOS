import { contextBridge, ipcRenderer } from 'electron'
import type {
  MiniPlayerWindowState,
  NavigationCommand,
  NavigationState,
  PlayerControlAction,
  PlayerState
} from '../types'

// Reduce Google/Electron browser detection surface in the page context.
try {
  Object.defineProperty(navigator, 'webdriver', { get: () => false })
  if (!('chrome' in window)) {
    Object.defineProperty(window, 'chrome', { value: { runtime: {} } })
  }
} catch {
  // ignore
}

contextBridge.exposeInMainWorld('ytmBridge', {
  sendState: (state: PlayerState) => {
    ipcRenderer.send('player:state', state)
  },
  onControl: (callback: (action: PlayerControlAction, seekTo?: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, action: PlayerControlAction, seekTo?: number) => {
      callback(action, seekTo)
    }
    ipcRenderer.on('player:control', handler)
    return () => ipcRenderer.removeListener('player:control', handler)
  },
  navigate: (command: NavigationCommand) => {
    return ipcRenderer.invoke('navigation:command', command) as Promise<NavigationState>
  },
  getNavigationState: () => {
    return ipcRenderer.invoke('navigation:state') as Promise<NavigationState>
  },
  onNavigationState: (callback: (state: NavigationState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: NavigationState) => {
      callback(state)
    }
    ipcRenderer.on('navigation:state-changed', handler)
    return () => ipcRenderer.removeListener('navigation:state-changed', handler)
  },
  getMiniPlayerWindowState: () => {
    return ipcRenderer.invoke('mini-player:window-state') as Promise<MiniPlayerWindowState>
  },
  toggleMiniPlayerAlwaysOnTop: () => {
    return ipcRenderer.invoke('mini-player:toggle-always-on-top') as Promise<MiniPlayerWindowState>
  },
  getMiniPlayerState: () => {
    return ipcRenderer.invoke('mini-player:state') as Promise<PlayerState | null>
  },
  sendMiniPlayerControl: (action: PlayerControlAction, value?: number) => {
    ipcRenderer.send('mini-player:control', action, value)
  },
  onMiniPlayerState: (callback: (state: PlayerState | null) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: PlayerState | null) => {
      callback(state)
    }
    ipcRenderer.on('mini-player:state', handler)
    return () => ipcRenderer.removeListener('mini-player:state', handler)
  }
})
