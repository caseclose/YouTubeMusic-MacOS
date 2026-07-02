import { app, Menu, session } from 'electron'
import { SESSION_PARTITION } from '../types'
import { loadUrl } from './browser-spoof'
import { getMainWindow, showMainWindow } from './windows'

const YTM_LOGIN_URL =
  'https://accounts.google.com/ServiceLogin?ltmpl=music&service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2Fsignin%3Faction_handle_signin%3Dtrue%26next%3Dhttps%253A%252F%252Fmusic.youtube.com%252F'

export function createAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: '账户',
      submenu: [
        {
          label: '登录…',
          accelerator: 'CommandOrControl+L',
          click: () => {
            const win = getMainWindow()
            if (win && !win.isDestroyed()) {
              showMainWindow()
              loadUrl(win.webContents, YTM_LOGIN_URL)
            }
          }
        },
        {
          label: '返回 YouTube Music',
          click: () => {
            const win = getMainWindow()
            if (win && !win.isDestroyed()) {
              loadUrl(win.webContents, 'https://music.youtube.com')
            }
          }
        },
        { type: 'separator' },
        {
          label: '清除登录缓存并重启',
          click: async () => {
            await session.fromPartition(SESSION_PARTITION).clearStorageData()
            app.relaunch()
            app.exit(0)
          }
        }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: '窗口',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
