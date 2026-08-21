const API_BASE = typeof window !== 'undefined'
  ? window.location.origin
  : 'http://localhost:4000'

function getWsUrl(): string {
  if (typeof window === 'undefined') return ''
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/graphql`
}

const WS_URL = getWsUrl()

export { API_BASE, WS_URL }
