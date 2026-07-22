const API_BASE = import.meta.env.DEV ? '' : 'https://api.minisocial.app'
const WS_URL = import.meta.env.DEV
  ? `ws://${window.location.hostname}:3000/graphql`
  : 'wss://api.minisocial.app/graphql'

export { API_BASE, WS_URL }
