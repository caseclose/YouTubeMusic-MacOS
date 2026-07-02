import { globalShortcut } from 'electron'
import Store from 'electron-store'
import { DEFAULT_SHORTCUTS, type ShortcutConfig } from '../types'
import { broadcastPlayerControl } from './player-control'
import { toggleMainWindow, toggleMiniPlayer } from './windows'

const store = new Store<{ shortcuts: ShortcutConfig }>({
  defaults: {
    shortcuts: DEFAULT_SHORTCUTS
  }
})

export function getShortcuts(): ShortcutConfig {
  return store.get('shortcuts')
}

export function registerGlobalShortcuts(): void {
  unregisterGlobalShortcuts()

  const shortcuts = getShortcuts()

  const bindings: Array<{ accelerator: string; action: () => void }> = [
    { accelerator: shortcuts.playPause, action: () => broadcastPlayerControl('playPause') },
    { accelerator: shortcuts.next, action: () => broadcastPlayerControl('next') },
    { accelerator: shortcuts.previous, action: () => broadcastPlayerControl('previous') },
    { accelerator: shortcuts.toggleMainWindow, action: () => toggleMainWindow() },
    { accelerator: shortcuts.toggleMiniPlayer, action: () => toggleMiniPlayer() }
  ]

  for (const { accelerator, action } of bindings) {
    if (!accelerator) continue

    try {
      const registered = globalShortcut.register(accelerator, action)
      if (!registered) {
        console.warn(`Failed to register shortcut: ${accelerator}`)
      }
    } catch (err) {
      console.warn(`Error registering shortcut ${accelerator}:`, err)
    }
  }
}

export function unregisterGlobalShortcuts(): void {
  globalShortcut.unregisterAll()
}
