import { contextBridge, ipcRenderer } from 'electron'
import type { NavigationCommand, NavigationState, PlayerControlAction, PlayerState } from '../types'

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
  }
})
