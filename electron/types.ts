export type PlayerControlAction = 'playPause' | 'next' | 'previous' | 'seek' | 'setVolume' | 'like' | 'dislike'
export type NavigationCommand = 'back' | 'forward' | 'reload' | 'toggleMini'

export interface NavigationState {
  canGoBack: boolean
  canGoForward: boolean
}

export interface MiniPlayerWindowState {
  alwaysOnTop: boolean
}

export interface PlayerState {
  title: string
  artist: string
  album: string
  thumbnail: string
  isPlaying: boolean
  duration: number
  position: number
  volume: number
  liked: boolean
  disliked: boolean
  canLike: boolean
  canDislike: boolean
}

export interface ShortcutConfig {
  playPause: string
  next: string
  previous: string
  toggleMainWindow: string
  toggleMiniPlayer: string
}

export const DEFAULT_SHORTCUTS: ShortcutConfig = {
  playPause: 'MediaPlayPause',
  next: 'MediaNextTrack',
  previous: 'MediaPreviousTrack',
  toggleMainWindow: 'CommandOrControl+Shift+M',
  toggleMiniPlayer: 'CommandOrControl+Shift+P'
}

export const YTM_URL = 'https://music.youtube.com'
export const SESSION_PARTITION = 'persist:ytmusic'
