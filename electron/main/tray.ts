import { app, Menu, Tray, nativeImage } from 'electron'
import { join } from 'path'
import { setIsQuitting } from './app-state'
import { broadcastPlayerControl } from './player-control'
import {
  showMainWindow,
  toggleMainWindow,
  toggleMiniPlayer
} from './windows'
import { getLastPlayerState } from './media'

let tray: Tray | null = null

function getTrayIcon() {
  const paths = [
    join(__dirname, '../../resources/trayTemplate@2x.png'),
    join(__dirname, '../../resources/trayTemplate.png'),
    join(process.resourcesPath, 'trayTemplate@2x.png'),
    join(process.resourcesPath, 'trayTemplate.png'),
    join(app.getAppPath(), 'resources/trayTemplate@2x.png'),
    join(app.getAppPath(), 'resources/trayTemplate.png')
  ]

  for (const iconPath of paths) {
    try {
      const image = nativeImage.createFromPath(iconPath)
      if (!image.isEmpty()) {
        image.setTemplateImage(true)
        return image
      }
    } catch {
      // try next path
    }
  }

  return nativeImage.createEmpty()
}

function buildContextMenu(): Menu {
  const state = getLastPlayerState()
  const playingLabel = state?.isPlaying ? 'Pause' : 'Play'

  return Menu.buildFromTemplate([
    {
      label: `${playingLabel}  ${state?.title ? `— ${state.title}` : ''}`,
      click: () => broadcastPlayerControl('playPause')
    },
    {
      label: 'Previous',
      click: () => broadcastPlayerControl('previous')
    },
    {
      label: 'Next',
      click: () => broadcastPlayerControl('next')
    },
    { type: 'separator' },
    {
      label: 'Show Main Window',
      click: () => showMainWindow()
    },
    {
      label: 'Toggle Mini Player',
      click: () => toggleMiniPlayer()
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        setIsQuitting(true)
        app.quit()
      }
    }
  ])
}

export function initTray(): void {
  if (tray) return

  tray = new Tray(getTrayIcon())
  tray.setToolTip('YouTube Music')

  tray.setContextMenu(buildContextMenu())

  tray.on('click', () => {
    toggleMainWindow()
  })

  tray.on('right-click', () => {
    tray?.setContextMenu(buildContextMenu())
    tray?.popUpContextMenu()
  })
}

export function refreshTrayMenu(): void {
  if (!tray) return
  tray.setContextMenu(buildContextMenu())
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
