(function (mode) {
  if (window.__ytmBridgeInstalled) return
  window.__ytmBridgeInstalled = true

  const POLL_INTERVAL = 1000

  function queryButton(selectors) {
    for (const selector of selectors) {
      const el = document.querySelector(selector)
      if (el) return el
    }
    return null
  }

  function clickButton(selectors) {
    const btn = queryButton(selectors)
    if (btn) {
      btn.click()
      return true
    }
    return false
  }

  function getVideo() {
    return document.querySelector('video')
  }

  function getTitle() {
    const titleEl = document.querySelector(
      'ytmusic-player-bar .title, ytmusic-player-bar a.yt-simple-endpoint, .ytmusic-player-bar .title'
    )
    return titleEl?.textContent?.trim() || document.title.replace(' - YouTube Music', '') || ''
  }

  function getArtist() {
    const artistEl = document.querySelector(
      'ytmusic-player-bar .byline, ytmusic-player-bar .subtitle, ytmusic-player-bar yt-formatted-string.byline'
    )
    return artistEl?.textContent?.trim() || ''
  }

  function getThumbnail() {
    const img = document.querySelector(
      'ytmusic-player-bar img, #player-bar-background img, .ytmusic-player-bar img'
    )
    return img?.src || img?.getAttribute('src') || ''
  }

  function getPlayerState() {
    const video = getVideo()
    return {
      title: getTitle(),
      artist: getArtist(),
      album: '',
      thumbnail: getThumbnail(),
      isPlaying: video ? !video.paused && !video.ended : false,
      duration: video?.duration && isFinite(video.duration) ? video.duration : 0,
      position: video?.currentTime && isFinite(video.currentTime) ? video.currentTime : 0
    }
  }

  function handleControl(action, seekTo) {
    const video = getVideo()

    switch (action) {
      case 'playPause':
        if (video) {
          if (video.paused) video.play().catch(function () {})
          else video.pause()
        } else {
          clickButton([
            'button[aria-label*="Pause"]',
            'button[aria-label*="Play"]',
            'tp-yt-paper-icon-button.play-pause-button',
            '#play-pause-button'
          ])
        }
        break
      case 'next':
        clickButton([
          'button[aria-label*="Next"]',
          'button[aria-label*="next"]',
          '.next-button',
          'tp-yt-paper-icon-button.next'
        ])
        break
      case 'previous':
        clickButton([
          'button[aria-label*="Previous"]',
          'button[aria-label*="previous"]',
          '.previous-button',
          'tp-yt-paper-icon-button.previous'
        ])
        break
      case 'seek':
        if (video && typeof seekTo === 'number') {
          video.currentTime = seekTo / 1000
        }
        break
    }
  }

  function updateMediaSession() {
    if (!('mediaSession' in navigator)) return

    const state = getPlayerState()

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: state.title || 'YouTube Music',
        artist: state.artist || '',
        album: state.album || '',
        artwork: state.thumbnail
          ? [{ src: state.thumbnail, sizes: '512x512', type: 'image/jpeg' }]
          : []
      })

      navigator.mediaSession.playbackState = state.isPlaying ? 'playing' : 'paused'
    } catch (err) {
      // ignore metadata errors for incomplete state
    }
  }

  function setupMediaSessionHandlers() {
    if (!('mediaSession' in navigator)) return

    const actions = {
      play: function () {
        handleControl('playPause')
      },
      pause: function () {
        handleControl('playPause')
      },
      previoustrack: function () {
        handleControl('previous')
      },
      nexttrack: function () {
        handleControl('next')
      },
      seekto: function (details) {
        if (details && typeof details.seekTime === 'number') {
          handleControl('seek', details.seekTime * 1000)
        }
      }
    }

    Object.keys(actions).forEach(function (action) {
      try {
        navigator.mediaSession.setActionHandler(action, actions[action])
      } catch (err) {
        // some actions may be unsupported
      }
    })
  }

  function sendState() {
    if (!window.ytmBridge) return
    const state = getPlayerState()
    window.ytmBridge.sendState(state)
    updateMediaSession()
  }

  if (window.ytmBridge && window.ytmBridge.onControl) {
    window.ytmBridge.onControl(handleControl)
  }

  setupMediaSessionHandlers()

  const observer = new MutationObserver(function () {
    sendState()
  })

  function observeTarget() {
    const bar = document.querySelector('ytmusic-player-bar')
    if (bar) {
      observer.observe(bar, { childList: true, subtree: true, characterData: true })
    }
  }

  const video = getVideo()
  if (video) {
    ;['play', 'pause', 'timeupdate', 'ended', 'loadedmetadata'].forEach(function (event) {
      video.addEventListener(event, sendState)
    })
  }

  observeTarget()
  setInterval(sendState, POLL_INTERVAL)
  setTimeout(observeTarget, 3000)
  sendState()

  if (mode === 'mini') {
    document.documentElement.style.setProperty('--ytmusic-mini-mode', '1')
  }
})
