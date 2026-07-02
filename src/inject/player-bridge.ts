/**
 * TypeScript source for the injected player bridge.
 * Runtime copy lives in resources/inject/player-bridge.js
 */
export type InjectMode = 'main' | 'mini'

export interface InjectedPlayerState {
  title: string
  artist: string
  album: string
  thumbnail: string
  isPlaying: boolean
  duration: number
  position: number
}
