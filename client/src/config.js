// client/src/config.js
// En dev (Vite proxy) : URLs relatives → le proxy redirige vers localhost:4000
// En prod : le serveur sert tout depuis le même port
const isDev = import.meta.env.DEV;

const SERVER = isDev ? "" : "http://localhost:4000";

export const GRAPHQL_HTTP = `${SERVER}/graphql`;
export const GRAPHQL_WS = isDev
  ? `ws://${window.location.host}/graphql`
  : `ws://localhost:4000/graphql`;
