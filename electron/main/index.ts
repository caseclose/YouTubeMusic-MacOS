import { app } from 'electron'
import { configureSession } from './session'
import { initMediaService, stopMediaService, updateNowPlaying } from './media'
import { initTray, refreshTrayMenu, destroyTray } from './tray'
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from './shortcuts'
import { createMainWindow, setupPlayerStateIpc, showMainWindow } from './windows'
import { setIsQuitting } from './app-state'
import { applyCommandLineSwitches, applyUserAgentFallback } from './browser-spoof'
import { createAppMenu } from './menu'

applyCommandLineSwitches()
applyUserAgentFallback()

if (process.platform === 'darwin') {
  app.dock?.show()
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showMainWindow()
  })

  app.whenReady().then(() => {
    configureSession()
    createAppMenu()
    initMediaService()
    initTray()

    setupPlayerStateIpc((state) => {
      updateNowPlaying(state)
      refreshTrayMenu()
    })

    createMainWindow()
    registerGlobalShortcuts()
  })

  app.on('activate', () => {
    showMainWindow()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('will-quit', () => {
    unregisterGlobalShortcuts()
    stopMediaService()
    destroyTray()
  })

  app.on('before-quit', () => {
    setIsQuitting(true)
  })
}
