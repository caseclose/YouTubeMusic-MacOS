import { app, session, type WebContents } from 'electron'
import { SESSION_PARTITION } from '../types'

export const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.152 Safari/537.36'

const spoofedContents = new WeakSet<WebContents>()

export function buildOriginalElectronUserAgent(): string {
  const chrome = process.versions.chrome || '130.0.0.0'
  const electron = process.versions.electron || '33.0.0'
  return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Electron/${electron} Safari/537.36`
}

export function isGoogleAuthRequest(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return (
      host === 'accounts.google.com' ||
      host.endsWith('.accounts.google.com') ||
      host === 'accounts.youtube.com' ||
      host === 'myaccount.google.com'
    )
  } catch {
    return false
  }
}

export function isYouTubeRequest(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return host.endsWith('youtube.com') || host.endsWith('googlevideo.com') || host.endsWith('ytimg.com')
  } catch {
    return false
  }
}

export function applyCommandLineSwitches(): void {
  app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled')
  app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp')
}

export function applyUserAgentFallback(): void {
  app.userAgentFallback = CHROME_UA
}

export function configureSessionSpoofing(): void {
  const ses = session.fromPartition(SESSION_PARTITION)
  const originalUserAgent = buildOriginalElectronUserAgent()

  ses.setUserAgent(CHROME_UA)

  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders }
    const pageUrl = details.webContents?.getURL() ?? ''

    // th-ch/youtube-music: on accounts.google.com retry, use original Electron UA
    if (
      pageUrl.startsWith('https://accounts.google.com') &&
      details.url.startsWith('https://accounts.google.com')
    ) {
      headers['User-Agent'] = originalUserAgent
      delete headers['sec-ch-ua']
      delete headers['Sec-CH-UA']
      delete headers['sec-ch-ua-mobile']
      delete headers['Sec-CH-UA-Mobile']
      delete headers['sec-ch-ua-platform']
      delete headers['Sec-CH-UA-Platform']
    } else {
      headers['User-Agent'] = CHROME_UA
      headers['sec-ch-ua'] = '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"'
      headers['sec-ch-ua-mobile'] = '?0'
      headers['sec-ch-ua-platform'] = '"macOS"'
    }

    callback({ requestHeaders: headers })
  })

  ses.webRequest.onHeadersReceived((details, callback) => {
    if (!isYouTubeRequest(details.url)) {
      callback({ responseHeaders: details.responseHeaders })
      return
    }

    const responseHeaders = { ...details.responseHeaders }
    delete responseHeaders['content-security-policy']
    delete responseHeaders['Content-Security-Policy']
    delete responseHeaders['content-security-policy-report-only']
    delete responseHeaders['Content-Security-Policy-Report-Only']

    callback({ responseHeaders })
  })
}

export function applyWebContentsSpoofing(contents: WebContents): void {
  if (spoofedContents.has(contents)) return
  spoofedContents.add(contents)

  contents.setUserAgent(CHROME_UA)

  contents.on('dom-ready', () => {
    contents
      .executeJavaScript(
        `
        (() => {
          try {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            if (!window.chrome) window.chrome = { runtime: {} };
          } catch (e) {}
        })();
      `,
        true
      )
      .catch(() => {})
  })
}

export function loadUrl(contents: WebContents, url: string): void {
  contents.setUserAgent(CHROME_UA)
  contents.loadURL(url, { userAgent: CHROME_UA })
}
