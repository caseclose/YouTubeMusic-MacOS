import type { PlayerControlAction, PlayerState } from '../types'

export interface YtmBridgeApi {
  sendState: (state: PlayerState) => void
  onControl: (callback: (action: PlayerControlAction, seekTo?: number) => void) => () => void
}

declare global {
  interface Window {
    ytmBridge?: YtmBridgeApi
    __ytmBridgeInstalled?: boolean
  }
}

export {}
