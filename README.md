# MiniSocial

Réseau social en temps réel construit avec GraphQL, WebSockets et WebRTC.

## Fonctionnalités

### Authentification
- Inscription / connexion avec hash bcrypt
- JWT double token : access (15min) + refresh (7j) avec rotation
- Logout serveur (révocation du refresh token)
- Rate limiting : global (200/15min), auth (10/15min), chat (60/15min)

### Publications
- Créer, modifier, supprimer des posts (auteur uniquement)
- Images avec upload base64 + rognage libre (canvas custom)
- Système de likes en temps réel
- Commentaires threadés (réponses imbriquées)
- Troncature "Voir plus / Voir moins" au-delà de 150 caractères
- Bouton partage (Web Share API / clipboard)

### Messagerie privée
- Permissions de chat : demander → accepter/refuser avant de pouvoir écrire
- Messages chiffrés AES-256-GCM (clé dans `.env`, stockage `iv:authTag:ciphertext`)
- Indicateur de frappe (typing indicator) en temps réel
- Indicateur de lecture (✓ / ✓✓)
- Marquage automatique comme lu à l'ouverture

### Groupes
- Créer des groupes, ajouter/retirer des membres
- Messages de groupe en temps réel

### Appels vidéo (WebRTC)
- Créer un appel depuis la messagerie privée
- Notification d'appel entrant (modale refuser/accepter)
- WebRTC peer-to-peer avec STUN/TURN (Open Relay)
- Contrôles micro/caméra/raccrocher

### Recherche
- Recherche sémantique TF-IDF avec stemmer français et suppression des diacritiques

### Présence
- Heartbeat toutes les 15s (updateLastSeen)
- Indicateur en ligne (last_seen < 30s)
- Notifications système : réseau coupé/rétabli, erreurs Apollo

### Profil
- Page profil avec bio (max 200 caractères)
- Liste des posts de l'utilisateur
- Compteur de publications

## Stack technique

### Backend
| Technologie | Rôle |
|---|---|
| Node.js + Express | Serveur HTTP |
| Apollo Server v4 | GraphQL API |
| graphql-ws | WebSocket subscriptions |
| SQLite (better-sqlite3) | Base de données |
| bcrypt + jsonwebtoken | Auth (hash + JWT) |
| AES-256-GCM (Node crypto) | Chiffrement des messages |
| natural (TF-IDF + stemmer FR) | Recherche sémantique |
| zod | Validation des entrées |
| express-rate-limit | Rate limiting |

### Frontend
| Technologie | Rôle |
|---|---|
| React 19 + Vite 8 | UI + bundler |
| Apollo Client v4 | GraphQL + cache + subscriptions |
| Zustand | State management (persisté en localStorage) |
| Tailwind CSS v4 | Styling utility-first |
| WebRTC | Appels vidéo peer-to-peer |

## Installation

```bash
# Cloner le repo
git clone <url>
cd testgrahpql

# Installer les dépendances backend
npm install

# Installer les dépendances frontend
cd client && npm install && cd ..

# Lancer le serveur (crée .env + social.db automatiquement)
npm start
```

Le serveur démarre sur `http://localhost:4000` et le frontend sur `http://localhost:5173`.

## Structure du projet

```
├── src/
│   ├── server.js              # Apollo Server + Express + WebSocket
│   ├── db.js                  # SQLite schema + migrations
│   ├── crypto.js              # AES-256-GCM encrypt/decrypt
│   ├── schema/
│   │   └── typeDefs.js        # Schéma GraphQL complet
│   ├── resolvers/
│   │   └── resolvers.js       # Queries, Mutations, Subscriptions
│   ├── middleware/
│   │   ├── auth.js            # Context JWT (HTTP + WS)
│   │   └── rateLimit.js       # Rate limiting
│   └── utils/
│       ├── tokens.js          # Sign/verify JWT
│       └── validation.js      # Schémas Zod
├── client/
│   ├── src/
│   │   ├── App.jsx            # Routeur + subscription globale appels
│   │   ├── apollo.js          # Client Apollo (error link, WS, auth)
│   │   ├── store.js           # Zustand (auth, UI, toasts)
│   │   ├── config.js          # URLs GraphQL
│   │   ├── index.css          # Design tokens + keyframes
│   │   ├── components/
│   │   │   ├── Header.jsx     # Navigation glassmorphic
│   │   │   ├── Feed.jsx       # Fil d'actualité + subscriptions
│   │   │   ├── PostCard.jsx   # Post (likes, commentaires, édition)
│   │   │   ├── Composer.jsx   # Création de post
│   │   │   ├── CommentItem.jsx# Commentaires threadés
│   │   │   ├── Chat.jsx       # Messagerie privée temps réel
│   │   │   ├── ChatLobby.jsx  # Liste contacts + groupes
│   │   │   ├── GroupChat.jsx  # Chat de groupe
│   │   │   ├── CreateGroup.jsx# Création de groupe
│   │   │   ├── IncomingCall.jsx# Notification d'appel entrant
│   │   │   ├── Meeting.jsx    # WebRTC + video
│   │   │   ├── MeetingControls.jsx # Contrôles micro/cam/raccrocher
│   │   │   ├── Search.jsx     # Recherche sémantique
│   │   │   ├── Sidebar.jsx    # Sidebar utilisateurs en ligne
│   │   │   ├── Profile.jsx    # Page profil
│   │   │   ├── Toast.jsx      # Système de toasts multi-niveaux
│   │   │   ├── ImageCropModal.jsx # Rogneur d'image canvas
│   │   │   └── UploadImage.jsx# Upload d'image
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx
│   │   │   └── RegisterPage.jsx
│   │   ├── hooks/
│   │   │   ├── useHeartbeat.js       # Présence (updateLastSeen)
│   │   │   ├── useNotifications.js   # Notifications navigateur
│   │   │   └── useSystemNotifications.js # Réseau + erreurs
│   │   └── utils.js
│   └── vite.config.js
└── .env                       # Généré automatiquement (JWT + MESSAGE_SECRET)
```

## Schéma GraphQL

### Types principaux
- `User` — id, name, email, bio, role, isOnline, posts, postCount
- `Post` — id, title, content, author, comments, likes, likeCount, imageUrl
- `Message` — id, text, sender, receiver, read, createdAt (chiffré en BDD)
- `ChatPermission` — sender, receiver, status (pending/accepted/rejected)
- `ChatGroup` — name, creator, members
- `Meeting` — title, creator, participants, isActive

### Subscriptions (temps réel)
- `postCreated` — Nouveau post
- `commentAdded(postId)` — Nouveau commentaire
- `likeToggled` — Like ajouté/supprimé
- `messageSent(userId1, userId2)` — Nouveau message privé
- `messageRead(userId)` — Message marqué comme lu
- `chatPermissionUpdated(userId)` — Demande acceptée/refusée
- `userTyping(userId1, userId2)` — Indicateur de frappe
- `groupMessageSent(groupId)` — Message de groupe
- `meetingInvited(userId)` — Appel entrant
- `meetingUpdated(meetingId)` — Participant rejoint/quitte
- `meetingSignal(meetingId)` — Signaux WebRTC (offer/answer/ICE)

## Sécurité

- Messages chiffrés AES-256-GCM avant stockage
- JWT avec rotation des refresh tokens (jti unique)
- Rate limiting global + par domaine
- Auth requise sur toutes les opérations sensibles
- Vérification des permissions avant lecture de conversation
- `markAsRead` restreint au destinataire du message
- Validation Zod sur les entrées (register, login, meeting)
- Clés secrètes dans `.env` (auto-générées au premier lancement)

## Environnement

Fichier `.env` (auto-généré) :

```
MESSAGE_SECRET=<256-bit hex>
JWT_ACCESS_SECRET=<aléatoire>
JWT_REFRESH_SECRET=<aléatoire>
```
