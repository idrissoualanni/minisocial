// client/src/apollo.js
import { ApolloClient, InMemoryCache, split, HttpLink, ApolloLink } from "@apollo/client";
import { getMainDefinition } from "@apollo/client/utilities";
import { onError } from "@apollo/client/link/error";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { createClient } from "graphql-ws";
import { GRAPHQL_HTTP, GRAPHQL_WS } from "./config";
import useStore from "./store";

// Debounce pour les erreurs répétées
let lastErrorTime = 0;
let lastErrorMsg = "";

function emitErrorToast(message) {
  const now = Date.now();
  if (message === lastErrorMsg && now - lastErrorTime < 2000) return;
  lastErrorTime = now;
  lastErrorMsg = message;
  useStore.getState().addToast(message, "error", 5000);
}

function emitWarningToast(message) {
  const now = Date.now();
  if (message === lastErrorMsg && now - lastErrorTime < 2000) return;
  lastErrorTime = now;
  lastErrorMsg = message;
  useStore.getState().addToast(message, "warning", 5000);
}

// Error link : intercepte les erreurs GraphQL (Apollo Client v4 — onError)
const errorLink = onError(({ graphQLErrors, networkError }) => {
  if (graphQLErrors) {
    for (const err of graphQLErrors) {
      const msg = err.message || "";
      const statusCode = err?.extensions?.code || err?.extensions?.http?.status;

      if (statusCode === 401 || msg.includes("Unauthenticated") || msg.includes("Token")) {
        emitErrorToast("Session expirée — reconnecte-toi");
      } else if (statusCode === 429 || msg.includes("rate limit") || msg.includes("Trop de requêtes")) {
        emitWarningToast("Trop de requêtes — patiente un instant");
      } else if (msg.includes("Not found") || statusCode === 404) {
        emitWarningToast("Ressource introuvable");
      }
    }
  }

  if (networkError) {
    const msg = networkError?.message || "";
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
      emitErrorToast("Connexion au serveur perdue");
    }
  }
});

// Auth link: injecte le token dans chaque requête HTTP
const authLink = new ApolloLink((operation, forward) => {
  const token = useStore.getState().accessToken;
  operation.setContext(({ headers = {} }) => ({
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : "",
    },
  }));
  return forward(operation);
});

// HTTP link
const httpLink = new HttpLink({ uri: GRAPHQL_HTTP });

// ── WebSocket link — optimisé selon docs graphql-ws ──
// - keepAlive: ping serveur toutes les 15s pour détecter les connexions mortes
// - lazy: connexion établie au 1er subscribe, fermée au dernier unsubscribe
// - retryWait: backoff exponentiel + jitter pour éviter le thundering herd
const wsLink = new GraphQLWsLink(
  createClient({
    url: GRAPHQL_WS,
    lazy: true,
    lazyCloseTimeout: 5000,
    keepAlive: 15000,
    connectionAckWaitTimeout: 10000,
    shouldRetry: () => true,
    retryAttempts: Infinity,
    retryWait: (retries) => {
      const delay = Math.min(1000 * 2 ** retries, 10000);
      return new Promise((resolve) =>
        setTimeout(resolve, delay + Math.random() * 1000)
      );
    },
    on: {
      connecting: (isRetry) => {
        if (isRetry) emitWarningToast("Reconnexion temps réel...");
      },
      connected: () => {},
      error: (err) => {
        const msg = err?.message || err?.toString() || "Erreur WebSocket";
        if (msg.includes("Unauthorized") || msg.includes("401")) {
          emitErrorToast("Authentification WS échouée");
        }
      },
      closed: () => {},
    },
    connectionParams: () => {
      const token = useStore.getState().accessToken;
      return { authorization: token ? `Bearer ${token}` : "" };
    },
  })
);

// Split: subscription → WS, query/mutation → HTTP
const splitLink = split(
  ({ query }) => {
    const def = getMainDefinition(query);
    return def.kind === "OperationDefinition" && def.operation === "subscription";
  },
  wsLink,
  errorLink.concat(authLink).concat(httpLink)
);

// ── Cache normalisé avec typePolicies ──
// Apollo identifie chaque objet par __typename + keyFields
// Ex: "Post:5", "User:3", "Comment:12" — pas de doublons dans le cache
// Quand un Post est modifié une seule fois, TOUS les composants qui le lisent sont notifiés
const cache = new InMemoryCache({
  typePolicies: {
    User: {
      keyFields: ["id"],
    },
    Post: {
      keyFields: ["id"],
      fields: {
        likeCount: {
          read(existing = 0) { return existing; },
        },
        likes: {
          merge(existing = [], incoming) { return incoming; },
        },
        comments: {
          merge(existing = [], incoming) { return incoming; },
        },
      },
    },
    Comment: {
      keyFields: ["id"],
    },
    Message: {
      keyFields: ["id"],
    },
    ChatPermission: {
      keyFields: ["id"],
    },
    Group: {
      keyFields: ["id"],
    },
    GroupMessage: {
      keyFields: ["id"],
    },
    // Types non normalisés (embed dans leur parent)
    ConversationPreview: {
      keyFields: false,
    },
    CallInvitation: {
      keyFields: false,
    },
  },
});

const client = new ApolloClient({
  link: splitLink,
  cache,
  connectToDevTools: true,
});

export default client;
