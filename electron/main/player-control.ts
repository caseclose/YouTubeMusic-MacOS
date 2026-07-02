import { BrowserWindow, WebContents } from 'electron'
import type { PlayerControlAction } from '../types'

type ControlHandler = (action: PlayerControlAction, seekTo?: number) => void

let controlHandler: ControlHandler | null = null
const windows = new Set<BrowserWindow>()

export function setControlHandler(handler: ControlHandler): void {
  controlHandler = handler
}

export function registerPlayerWindow(win: BrowserWindow): void {
  windows.add(win)
  win.on('closed', () => windows.delete(win))
}

export function getPlayerWindows(): BrowserWindow[] {
  return [...windows].filter((w) => !w.isDestroyed())
}

export function getPrimaryPlayerWebContents(): WebContents | null {
  const main = getPlayerWindows().find((w) => w.getTitle() !== 'Mini Player')
  return main?.webContents ?? getPlayerWindows()[0]?.webContents ?? null
}

export function sendPlayerControl(action: PlayerControlAction, seekTo?: number): void {
  if (controlHandler) {
    controlHandler(action, seekTo)
    return
  }

  const contents = getPrimaryPlayerWebContents()
  if (!contents || contents.isDestroyed()) return

  contents.send('player:control', action, seekTo)
}

export function broadcastPlayerControl(action: PlayerControlAction, seekTo?: number): void {
  for (const win of getPlayerWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('player:control', action, seekTo)
    }
  }
}
