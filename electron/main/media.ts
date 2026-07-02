import type { PlayerState } from '../types'

let lastState: PlayerState | null = null

export function initMediaService(): void {
  // Now Playing and media key handlers are set up in the injected
  // player-bridge via the Web Media Session API. Global media keys
  // are registered in shortcuts.ts.
}

export function updateNowPlaying(state: PlayerState): void {
  lastState = state
}

export function stopMediaService(): void {
  lastState = null
}

export function getLastPlayerState(): PlayerState | null {
  return lastState
}
