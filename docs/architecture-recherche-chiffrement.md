# Architecture : Chiffrement, Recherche, Indexation, Appels & UX Feed

> Document de réflexion sur l'architecture technique et UX de MiniSocial :
> chiffrement de bout en bout (E2EE), recherche plein texte (FTS5),
> recherche sémantique (pgvector), appels audio/vidéo (LiveKit),
> et design du fil d'actualité.

---

## 1. Résumé des décisions

| Technologie / UX | Pour quoi | Priorité | Complexité |
|---|---|---|---|
| **FTS5** | Recherche plein texte (posts + utilisateurs) | Immédiate | Faible |
| **E2EE** (Web Crypto) | Chiffrement des messages privés | Courte | Moyenne |
| **pgvector** | Recherche sémantique (embeddings) | Long terme | Élevée |
| **LiveKit** | Appels audio/vidéo temps réel (self-hosted SFU) | Courte | Moyenne |
| **Feed UX** (§12) | Skeleton loading, pagination, save, animations | Courte | Faible |

L'ensemble est compatible : chaque système est indépendant et peut coexister.

---

## 2. FTS5 — Recherche plein texte

### Rôle

Indexer et chercher les **posts** (publics) et les **utilisateurs** par mots-clés. Technologie déjà disponible dans SQLite via `better-sqlite3`.

### Ce qu'il apporte

- Recherche par mots exacts avec préfixe ("marc" → "marc", "marchand")
- Suppression des accents ("café" → "cafe")
- Classement BM25 (pertinence)
- Index persistant, mis à jour en temps réel par des triggers SQL
- Zéro dépendance, zéro infrastructure

### Ce qu'il ne fait PAS

- Compréhension du sens ("voiture" ≠ "automobile")
- Synonymes
- Requêtes en langage naturel

### Architecture

```
Base SQLite existante
  ├── posts table (données)
  ├── posts_fts (index FTS5 virtuel)
  ├── app_users table (données)
  └── users_fts (index FTS5 virtuel)

Flow:
  Création d'un post → trigger → posts_fts mis à jour
  Recherche → MATCH query → résultats classés par pertinence
```

### Intégration

- Dans `src/db.js` : création des tables virtuelles + triggers + population initiale
- Dans `src/schema/typeDefs.js` : nouveau type `SearchResults { posts, users }` 
- Dans `src/resolvers/resolvers.js` : remplacement de l'implémentation TF-IDF par des requêtes FTS5
- Côté client : création d'un composant `Search.jsx` avec debounce et affichage des résultats

---

## 3. E2EE — Chiffrement de bout en bout

### Rôle

Garantir que les **messages privés** et les **messages de groupe** ne peuvent être lus que par l'expéditeur et le destinataire, même par le serveur.

### Protocole

Chiffrement **hybride** (asymétrique + symétrique), calqué sur PGP/ProtonMail :

```
À l'inscription :
  1. Le navigateur génère une paire de clés RSA-OAEP (2048 bits)
  2. La clé privée est stockée dans IndexedDB (jamais envoyée au serveur)
  3. La clé publique est uploadée sur le serveur

Envoi d'un message :
  1. Générer une clé AES-256-GCM aléatoire (session key)
  2. Chiffrer le message avec AES (rapide)
  3. Chiffrer la clé AES avec la clé RSA publique du destinataire
  4. Envoyer { ciphertext, encryptedKey, iv } au serveur
  5. Le serveur stocke le tout sans pouvoir le lire

Réception d'un message :
  1. Récupérer le payload depuis le serveur
  2. Déchiffrer la clé AES avec sa clé RSA privée
  3. Déchiffrer le message avec la clé AES
```

### Implémentation

Utilisation de la **Web Crypto API** (native dans tous les navigateurs, zéro dépendance) :

- `window.crypto.subtle.generateKey()` → paire RSA-OAEP
- `window.crypto.subtle.encrypt()` → AES-GCM
- `window.crypto.subtle.wrapKey()` → chiffrer la clé AES avec RSA
- `window.crypto.subtle.unwrapKey()` → déchiffrer la clé AES
- Stockage de la clé privée dans **IndexedDB**

### Impact sur le projet

| Avant | Après |
|---|---|
| `src/crypto.js` chiffre/déchiffre côté serveur | Cryptographie déplacée côté client |
| Serveur voit tout en clair | Serveur relaye des blobs illisibles |
| Une seule clé dans `.env` | Chaque utilisateur a ses propres clés |
| Messages en clair dans la réponse GraphQL | Messages chiffrés avant d'atteindre le serveur |

### Limites à connaître

- **Recherche dans les messages impossible** (le serveur ne voit pas le texte) — c'est le choix assumé
- **Perte de clé = perte des messages** — nécessite un mécanisme d'export/import de clé privée
- **Messages existants non migrés** — l'ancien format reste accessible via l'ancien déchiffreur serveur
- **Messages de groupe** : nécessite une clé de groupe partagée entre tous les membres

---

## 4. pgvector — Recherche sémantique

### Rôle

Permettre la recherche par **similarité de sens** plutôt que par mots exacts. 
"Combien coûte une voiture ?" trouve des posts sur "prix des véhicules".

### Pré-requis

pgvector est une extension PostgreSQL. Son utilisation implique :

1. **Migrer SQLite → PostgreSQL** (toutes les tables, les données, les triggers, l'indexation FTS)
2. **Avoir un service PostgreSQL** managé (Supabase, Railway, Neon, etc.) ou auto-hébergé
3. **Un modèle d'embeddings** pour transformer le texte en vecteurs

### Modèles d'embeddings possibles

| Modèle | Taille vecteur | Hébergement | Coût |
|---|---|---|---|
| **OpenAI text-embedding-3-small** | 1536 | API OpenAI | Payant (∼$0.02/1M tokens) |
| **Workers AI @cf/baai/bge-base-en** | 768 | Cloudflare | Gratuit (limité) |
| **Ollama (local)** | 768 | Serveur local | Gratuit (nécessite GPU/CPU) |
| **Supabase pgvector (self-hosted)** | 384 | Supabase | Inclus selon plan |

### Architecture

```
PostgreSQL + pgvector
  ├── posts (table)
  │   ├── title TEXT
  │   ├── content TEXT
  │   └── embedding vector(768)  ← colonne pgvector
  ├── posts_fts (GIN index PostgreSQL)  ← FTS natif PostgreSQL
  └── users (idem)

Flow:
  1. Création d'un post → appeler l'API embeddings → stocker le vecteur
  2. Recherche → transformer la requête en vecteur → cosine similarity
  3. Hybride : FTS (mots exacts) + pgvector (sens) avec fusion pondérée
```

### Recherche hybride (recommandée)

La meilleure approche combine les deux :

```
1. Lancer une recherche FTS (retourne un score textuel)
2. Lancer une recherche vectorielle (retourne un score sémantique)
3. Normaliser les deux scores (0..1)
4. Score final = α × score_text + (1 - α) × score_vector
   (α = 0.3 donne plus de poids au sens qu'aux mots exacts)
```

### Calendrier suggéré

pgvector est une **étape future** qui suppose la migration PostgreSQL déjà faite. Elle peut être ajoutée sans casser FTS5 ni l'E2EE — les deux coexistent :

- FTS5 (ou FTS PostgreSQL) continue de gérer la recherche textuelle exacte
- pgvector ajoute une couche sémantique par dessus
- L'E2EE ne concerne que les messages, pas les posts, donc aucun conflit

---

## 5. Compatibilité entre les trois

| | FTS5 | E2EE | pgvector |
|---|---|---|---|
| **FTS5** | — | ✅ Compatible (ne touche pas les messages) | ✅ Compatible (complémentaire) |
| **E2EE** | ✅ Compatible | — | ⚠️ E2EE rend la recherche vectorielle dans les messages impossible aussi |
| **pgvector** | ✅ Complémentaire | ⚠️ Idem FTS5 | — |

**Règle simple :** les posts sont publics (recherchables avec FTS5 + pgvector). Les messages sont privés (E2EE, pas de recherche serveur).

---

## 6. Page de profil — Design et composants

### Rôle

Afficher l'identité numérique d'un utilisateur : qui il est, ce qu'il fait, ce qu'il publie. Point d'entrée pour les actions sociales (suivre, message, partage).

### Maquette ASCII

```
┌──────────────────────────────────────────────────────┐
│  ← Retour au feed                                    │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  ░░░░░░░░░░░░░ COVER IMAGE ░░░░░░░░░░░░░░░░░░░░ │  │
│  │  ░░░░░░░░░ (dégradé ou photo uploadée) ░░░░░░░░░ │  │
│  │  ░░░░░░░░░░░░░░░░░░░ 180px ░░░░░░░░░░░░░░░░░░░░░│  │
│  │                    ┌──────┐                       │  │
│  │                    │ AVAT │ ← 80px, rond,         │  │
│  │                    │  AR  │   bord blanc 4px,     │  │
│  │                    └──────┘   chevauche cover/card│  │
│  │                       ● point vert (online)       │  │
│  │                                                    │  │
│  │               Nom Prénom                           │  │
│  │               @email ou @username                  │  │
│  │                                                    │  │
│  │  Une courte bio qui dit ce que la personne         │  │
│  │  aime et fait. Sur une ou deux lignes max.         │  │
│  │                                                    │  │
│  │  📍 Paris  •  🗓️ Membre depuis juin 2026          │  │
│  │  🏢 Ingénieur logiciel                             │  │
│  │                                                    │  │
│  │  ┌───────┐ ┌───────┐ ┌───────┐                     │  │
│  │  │  42   │ │  12   │ │  8    │  ← stats en mono   │  │
│  │  │ Posts │ │ Abonnés│ │ Abos  │                     │  │
│  │  └───────┘ └───────┘ └───────┘                     │  │
│  │                                                    │  │
│  │  [Modifier]  [📋 Partager]  [✉️ Message]           │  │
│  │                                                    │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ┌────────────┬──────────┬────────────┐                │
│  │  Posts     │  Likes   │  À propos  │  ← Tabs       │
│  └────────────┴──────────┴────────────┘                │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Cartes des posts (composant PostCard réutilisé) │  │
│  │  ┌────────────────────────────────────────────┐  │  │
│  │  │  [Avatar] Nom · il y a 2h                  │  │  │
│  │  │  Titre du post                             │  │  │
│  │  │  ❤️ 5  💬 2                               │  │  │
│  │  └────────────────────────────────────────────┘  │  │
│  │  ...                                              │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  Ou si 0 post :                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │         📝 Aucune publication                    │  │
│  │   Quand tu publieras, ça apparaîtra ici.         │  │
│  │         [📝 Créer une publication]               │  │
│  └──────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### Sections détaillées

**1. Cover image** — bannière 180px de haut :
- Dégradé généré à partir du userId (même logique que `getAvatarGradient`)
- Ou photo uploadée, modifiable si c'est le profil de l'utilisateur connecté
- Couleur cohérente avec l'avatar

**2. Avatar** — 80×80px, rond, bord blanc 4px, ombre légère :
- Initiale ou photo de profil
- Chevauche la cover et la carte (moitié dedans, moitié dehors)
- Point vert "En ligne" en bas à droite
- Utilisation du composant shadcn `Avatar`

**3. Infos personnelles** :
- **Nom** 20px bold
- **@email** ou pseudo 13px text-tertiary
- **Bio** 14px text-secondary, max 2 lignes avec "Voir plus"
- **Localisation, emploi, date d'inscription** — métadonnées affichées en icônes + texte

**4. Stats row** — 3 chiffres en police monospaced :
- Posts / Abonnés / Abonnements
- Cliquable pour voir la liste des abonnés/abonnements

**5. Actions** — 3 boutons principaux :
- **Modifier le profil** (visible seulement si c'est mon profil)
- **Partager** (copie le lien du profil)
- **Suivre / Ne plus suivre** (visible si c'est le profil d'un autre)
- **Message** (ouvre le chat si permission acceptée)

**6. Tabs de contenu** — composant shadcn `Tabs` :
- **Posts** : grille/liste des publications de l'utilisateur (PostCard existant)
- **Likes** : posts que l'utilisateur a likés (à implémenter côté serveur)
- **À propos** : bio + infos + stats complètes

**7. Empty state** — quand 0 post :
- Message + CTA "Créer une publication" qui redirige vers le feed

### Composants shadcn/ui nécessaires

| Composant | Statut | Action |
|---|---|---|
| `Card` | ✅ déjà installé | Utilisé pour la carte profil |
| `Avatar` | ✅ déjà installé | Remplacer l'initiale actuelle |
| `Button` | ✅ déjà installé | Actions (Modifier, Suivre, Message) |
| `Badge` | ✅ déjà installé | Badge "En ligne" |
| `Separator` | ✅ déjà installé | Séparation des sections |
| `Tabs` | ❌ manquant | `npx shadcn add tabs` |
| `Skeleton` | ✅ déjà installé | Loading state du profil |

### Ce qu'il manque pour que le profil soit complet

**Dans la base de données :**

```sql
CREATE TABLE IF NOT EXISTS follows (
  follower_id  INTEGER NOT NULL,
  following_id INTEGER NOT NULL,
  created_at   TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (follower_id, following_id),
  FOREIGN KEY (follower_id) REFERENCES app_users(id) ON DELETE CASCADE,
  FOREIGN KEY (following_id) REFERENCES app_users(id) ON DELETE CASCADE
);
```

**Dans le GraphQL (typeDefs) :**

```graphql
type User {
  # ... champs existants ...
  followers: [User!]!
  following: [User!]!
  followerCount: Int!
  followingCount: Int!
}

type Mutation {
  # ... mutations existantes ...
  follow(userId: ID!): Boolean!
  unfollow(userId: ID!): Boolean!
}

type Query {
  # ... queries existantes ...
  followers(userId: ID!): [User!]!
  following(userId: ID!): [User!]!
}
```

**Côté client :**
- Bouton "Suivre / Ne plus suivre" dans le profil
- Onglet "Abonnés" et "Abonnements"
- Les stats abonnés/abonnements dans le header du profil

**Dans l'algorithme :** voir section suivante (§7).

---

## 7. Feed intelligent — Recommandation par profil

### Rôle

Fournir un fil d'actualité qui montre à un utilisateur les posts pertinents : ceux des personnes qu'il suit, et ceux des personnes qui **partagent ses centres d'intérêt** (même s'il ne les suit pas).

### Principe : hybridation de 5 signaux

Le feed est calculé par une **moyenne pondérée de 5 signaux** indépendants :

```
Score final = (w₁ × follow_direct)
            + (w₂ × similarité_contenu) 
            + (w₃ × similarité_engagement) 
            + (w₄ × proximité_sociale)
            + (w₅ × co_following)
```

Poids recommandés pour la version 1 (à ajuster selon l'usage) :  
`w₁ = 0.30` (follow direct), `w₂ = 0.20` (contenu), `w₃ = 0.20` (engagement), `w₄ = 0.10` (social), `w₅ = 0.20` (co-following)

### Signal 1 — Follow direct (NOUVEAU)

**Concept :** Si l'utilisateur suit l'auteur du post, c'est le signal le plus fort possible. C'est une déclaration explicite "je veux voir son contenu".

**Fonctionnement :**
- Si l'utilisateur A suit l'utilisateur B → score = 1.0
- Sinon → score = 0.0
- C'est binaire, pas de demi-mesure. Le follow est un signal oui/non.

**Poids le plus élevé (0.30)** car c'est le seul signal volontaire et explicite.

### Signal 2 — Co-following (NOUVEAU)

**Concept :** "Les gens qui suivent les mêmes comptes que toi ont probablement des goûts similaires." C'est un signal puissant de découverte — il permet de recommander des personnes que tu ne suis pas encore.

**Fonctionnement :**

1. Récupérer la liste des comptes que l'utilisateur suit (set A)
2. Pour chaque auteur de post, récupérer la liste de ses followers (set B)
3. Calculer l'intersection : combien de personnes suivent à la fois l'utilisateur courant ET l'auteur du post ?

```
co_following = |followers_communs| / max_followers_communs_du_réseau
```

**Exemple :**
- Alice suit {Bob, Charly}
- David suit {Bob, Charly, Ève}
- Alice ne suit pas David mais ils ont 2 followers en commun
- Le co-following donne un score non nul → le post de David peut apparaître dans le feed d'Alice

**Utilité :** permet la **découverte** sans rien connaître du contenu. C'est le mécanisme principal des recommandations "les gens que vous connaissez peut-être".

### Signal 3 — Similarité de contenu (TF-IDF)

**Concept :** deux utilisateurs qui écrivent sur les mêmes sujets ont probablement des intérêts communs.

**Fonctionnement :**

1. Le **document utilisateur** est construit par concaténation de :
   - Sa `bio`
   - Les `title` et `content` de tous ses posts
   - Les `text` de ses commentaires (optionnel)

   Exemple :
   ```
   Alice a écrit :
     Post 1 : "super match de foot hier soir"
     Post 2 : "NBA les playoffs commencent"
     Bio    : "fan de sport"
   
   → Document = "super match de foot hier soir NBA les playoffs commencent fan de sport"
   ```

2. Un vecteur TF-IDF est calculé pour chaque document utilisateur
3. La similarité cosinus entre deux vecteurs donne un score de proximité thématique

**Stockage :** calcul à la demande, pas de matrice en mémoire. Le document brut (texte) est stocké en base ou reconstruit à partir des posts à chaque requête. Pour un volume < 1000 utilisateurs, le coût est négligeable.

**Limites :**
- Cold start : un utilisateur sans posts ni bio a un vecteur vide → score nul
- Nécessite assez de texte pour que les différences soient significatives
- Ne capture pas le sens (synonymes, contexte)

### Signal 4 — Similarité d'engagement (filtrage collaboratif)

**Concept :** deux utilisateurs qui likent/commentent les mêmes posts ont des goûts similaires (même s'ils n'écrivent pas sur les mêmes sujets).

**Fonctionnement :**

1. Pour chaque utilisateur, on construit l'ensemble des post_id qu'il a likés
2. Similarité = **coefficient de Jaccard** entre deux ensembles :

   ```
   J(A, B) = |likes_A ∩ likes_B| / |likes_A ∪ likes_B|
   ```

   Si Alice a liké les posts {1, 2, 3} et Bob les posts {1, 2, 4} → J = 2/4 = 0.5

3. Ce score est combiné avec les autres signaux

**Avantage :** peut créer des **ponts entre sujets différents** — si Bob (sport) like un post de Charly (cuisine), l'algo peut déduire une similarité partielle et montrer du contenu cuisine à Alice qui ressemble à Bob.

**Limite :** cold start également (pas de likes → pas de signal).

### Signal 5 — Proximité sociale

**Concept :** les personnes qui parlent entre elles (DM, groupes) partagent des affinités. C'est le graphe social implicite.

**Fonctionnement :**

1. Compter les interactions entre utilisateurs (messages échangés, appartenance aux mêmes groupes)
2. Normaliser en score 0..1 :

   ```
   proximité = nb_messages_échangés / max_messages_du_réseau
   ```

3. Les utilisateurs avec qui on interagit le plus voient leurs posts boostés

**Utilité :** ancre la recommandation dans le réel. Même si deux personnes n'écrivent pas sur les mêmes sujets, le fait qu'elles discutent régulièrement est un signal fort de similarité.

---

### Architecture

```
Query feed(userId: ID!) :
  1. Récupérer tous les posts récents (ex: < 7 jours)
  2. Pour chaque auteur de post, calculer :
     a. follow_direct (est-ce que userId suit l'auteur ?)
     b. similarité_contenu (TF-IDF sur les documents utilisateur)
     c. similarité_engagement (Jaccard sur les likes)
     d. proximité_sociale (messages échangés)
     e. co_following (followers en commun)
  3. Score = 0.30×a + 0.20×b + 0.20×c + 0.10×d + 0.20×e
  4. Trier les posts par score descendant
  5. Appliquer diversification (pas 3 posts du même auteur à la suite)
  6. Exploration forcée : remplacer 5-10% des posts par des posts aléatoires
  7. Retourner les N premiers
```

**Stockage :** aucun. Tout est calculé à la demande (échelle < 1000 utilisateurs). Le document utilisateur est soit stocké dans une colonne `app_users.document`, soit reconstruit à chaque requête via une jointure SQL.

### Cold start

Pour les nouveaux utilisateurs sans données, les signaux 2-5 sont à zéro. Solutions progressives :

| Solution | Complexité | Description |
|---|---|---|
| Feed par défaut | Triviale | Montrer les posts des comptes les plus suivis du réseau |
| Onboarding | Faible | Proposer des thèmes au moment de l'inscription |
| Suivre des comptes suggérés | Faible | Proposer des comptes populaires à suivre dès l'inscription |
| Exploration forcée | Faible | Injecter 5-10% de posts aléatoires dans le feed pour apprendre |
| Mode "Feed chronologique" | Triviale | Fallback : si 0 suivis, montrer les posts récents de tout le monde |

**Cas du follow direct :** même un nouvel utilisateur peut obtenir un score non nul dès qu'il suit quelques comptes. C'est l'avantage du follow : il ne nécessite aucun historique pour fonctionner.

### Évolution possible : d'un système de règles à un modèle entraîné

La version 1 utilise des **poids fixes** (0.30, 0.20, 0.20, 0.10, 0.20) décidés à la main. À terme, ces poids peuvent être **appris par un modèle** à partir des interactions utilisateurs :

```
Phase 1 (règles) :
  score = follow * 0.30 + contentSim * 0.20 + engageSim * 0.20 + socialProx * 0.10 + coFollow * 0.20

Phase 2 (modèle entraîné) :
  score = model.predict([follow, contentSim, engageSim, socialProx, coFollow, recency, postAge])
```

L'interface est identique — les features d'entrée sont les mêmes (signaux 1-5), seule la méthode de scoring change. La migration peut se faire sans casser le client.

Pré-requis pour phase 2 : des centaines d'interactions utilisateur-post étiquetées (liké/non liké).

---

## 8. Optimisation de la messagerie — Inbox, Requests et anti-spam

### Rôle

Empêcher le spam et les abus de messagerie tout en permettant aux utilisateurs légitimes de contacter qui ils veulent. Actuellement, **tout le monde peut envoyer une demande de chat à tout le monde sans limite** — c'est un vecteur de spam direct.

### Principe : séparer inbox et requests

Toutes les grandes plateformes (Instagram, TikTok, Twitter/X, LinkedIn) utilisent le même pattern : **2 niveaux de réception** distincts.

| Qui envoie | Où ça arrive |
|---|---|
| Follow mutuel (A suit B ET B suit A) | **Inbox** — notification, lu direct |
| Chat déjà accepté (permission existante) | **Inbox** — notification, lu direct |
| Inconnu (aucun lien) | **Requests** — dossier séparé, pas de notif |
| Bloqué | Ignoré silencieusement |

### Architecture proposée

```
┌─────────────────────────────────────────────┐
│                  Messages                    │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │  Inbox                               │   │
│  │  ├─ Alice • "Salut !" • 12:30        │   │
│  │  ├─ Bob • "Tu viens ?" • 11:15       │   │
│  │  └─ Charly • "Merci !" • hier        │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │  Requests (3)                      ██│   │
│  │  ├─ David (inconnu) • "Je suis..." │   │
│  │  │  [Accepter] [Ignorer] [Bloquer] │   │
│  │  ├─ Eve (inconnue) • "Super post"  │   │
│  │  └─ Frank (inconnu) • "Tu vends ?" │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

**Règle clé :** un inconnu n'a droit qu'à **1 seul message** dans la request. Pas de pièces jointes, pas de suivi. Il doit attendre que le destinataire accepte pour continuer.

### Règle de routage (côté serveur)

```python
# Mutation sendMessage(senderId, receiverId, content)

if senderId est bloqué par receiverId:
    return erreur "Vous ne pouvez pas envoyer de message"

if senderId suit receiverId OU receiverId suit senderId (follow mutuel):
    → Inbox direct (comportement actuel)

if chat_permission existe déjà (déjà accepté avant):
    → Inbox direct

if une request existe déjà pour ce sender vers ce receiver:
    → Erreur "En attente de réponse. Vous ne pouvez envoyer qu'un seul message."

else:
    → Créer une request avec le premier message
    → 1 seule request autorisée par expéditeur
```

### Rate limiting

Couche supplémentaire pour empêcher les abus massifs :

```
Messages vers des inconnus (nouveaux) :
  → 5 par heure, 20 par jour

Demandes de chat (premier contact) :
  → 10 par jour

Follows :
  → 30 par heure

Messages vers des contacts existants :
  → Pas de limite (sauf limite raisonnable pour éviter le flood)
```

Les limites sont **niveau-dépendantes** — un utilisateur plus actif a plus de droits (voir trust levels).

### Trust levels progressifs

Système inspiré de Discord, Reddit et Zentalk :

| Niveau | Condition | Messages/h | Follows/h | Requests/jour |
|---|---|---|---|---|
| 0 — Nouveau | < 7 jours ou < 3 posts | 2 vers inconnus | 5 | 3 |
| 1 — Basique | > 7 jours et > 3 posts | 10 vers inconnus | 20 | 10 |
| 2 — Établi | > 30 jours et > 20 interactions | 30 vers inconnus | 60 | 30 |
| 3 — De confiance | > 90 jours et 0 signalement | Illimité | Illimité | Illimité |

### Évolution possible : spam score comportemental

À terme, un score automatique peut remplacer les niveaux fixes :

```python
score = 0
if messages/h > 30:           score += 20   # volume suspect
if taux_de_réponse < 5%:      score += 15   # envoie mais ne répond pas
if age_compte < 7 jours:      score *= 1.5  # compte jeune
if messages_identiques:       score += 30   # copier-coller
if signalements_recus > 3:    score += 50   # rapporté par d'autres
```

Si `score > seuil` → restrictions progressives (ralentir, puis restreindre, puis bannir).

---

## 9. LiveKit — Appels audio/vidéo

### Rôle

Permettre des **appels audio et vidéo en temps réel** entre utilisateurs de MiniSocial (1-1 et groupes), avec un serveur SFU (Selective Forwarding Unit) self-hosté.

### Bilan des options (2026)

| Solution | Open Source | Self-hosted | SDK React | Coût |
|---|---|---|---|---|
| **LiveKit** | ✅ Oui | ✅ Oui | ✅ `@livekit/components-react` | Gratuit (self-hosted) |
| Daily.co | ❌ Non | ❌ Non | ✅ | À partir de $10k/mois |
| Agora | ❌ Non | ❌ Non | ✅ | Payant à l'usage |
| Jitsi | ✅ Oui | ✅ Oui | ❌ (React partiel) | Gratuit |
| MediaSoup | ✅ Oui | ✅ Oui | ❌ (bas niveau) | Gratuit |

**Décision :** LiveKit. SFU avec client React prêt à l'emploi, utilisé en production (OpenAI ChatGPT Voice, 90K+ appels/mois), documentation excellente, gratuit en self-hosted. Jitsi est moins bon sur l'état du SDK React ; MediaSoup demande de tout construire.

### Architecture système

```
┌─────────── CLIENT (React + Vite) ───────────────────────────────┐
│                                                                   │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │  MeetingRoom  │    │  Inbox       │    │  Profile          │   │
│  │  - vidéo/audio│    │  - icône app │    │  - bouton appeler │   │
│  │  - participant│    │  - accepte   │    │                    │   │
│  │  - mute/hangup│    │  - refuse    │    │                    │   │
│  └──────┬───────┘    └──────┬───────┘    └────────┬─────────┘   │
│         │                   │                     │              │
│  ┌──────▼───────────────────▼─────────────────────▼────────┐    │
│  │              @livekit/components-react                  │    │
│  │              livekit-client                             │    │
│  └─────────────────────────┬──────────────────────────────┘    │
└────────────────────────────┼───────────────────────────────────┘
                             │
         WS (GraphQL Sub)   │   WSS (LiveKit)
                             │
┌──────▼─────────────────────┼─────────── SERVEUR ───────────────┐
│                            │                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         GraphQL Apollo Server (Express)                  │  │
│  │                                                           │  │
│  │  Mutation: createMeeting     → crée salle + notifie      │  │
│  │  Mutation: joinMeeting       → ajoute participant        │  │
│  │  Mutation: leaveMeeting      → retire participant        │  │
│  │  Mutation: getLiveKitToken   → token JWT LiveKit         │  │
│  │  Subscription: meetingInvited→ notification d'appel      │  │
│  └────────────────────┬─────────────────────────────────────┘  │
│                       │                                         │
│  ┌────────────────────▼─────────────────────────────────────┐  │
│  │         livekit-server-sdk (Node.js)                     │  │
│  │         - génère les AccessToken                        │  │
│  └────────────────────┬─────────────────────────────────────┘  │
└───────────────────────┼─────────────────────────────────────────┘
                        │
┌───────────────────────▼──────────── Docker ─────────────────────┐
│                      livekit/livekit-server                      │
│                                                                   │
│  - Port 7880 (HTTP/WSS)            - Port 7881 (TCP/TURN)       │
│  - Ports 50000-50200/udp (media)                                 │
│                                                                   │
│  Clés partagées : LIVEKIT_KEY / LIVEKIT_SECRET                   │
└───────────────────────────────────────────────────────────────────┘
```

### Flux d'un appel (pas à pas)

```
Utilisateur A                    MiniSocial (API)              LiveKit Server
     │                                │                            │
     │  1. createMeeting              │                            │
     │  (targetUserId: B) ──────────►│                            │
     │                                │  2. Notifie B via WS     │
     │  ◄── meetingId ──────────────│  (meetingInvited)           │
     │                                │                            │
     │  3. getLiveKitToken            │                            │
     │  (roomName: "meeting-42") ───►│                            │
     │                                │  4. AccessToken(JWT)      │
     │  ◄── token + serverUrl ──────│                            │
     │                                │                            │
     │  5. Rejoint room "meeting-42"  │                            │
     │  ────────────────────────────────────────────────────────►│
     │                                │                            │
     │                                │                            │
Utilisateur B                         │                            │
     │                                │                            │
     │  6. Reçoit notification        │                            │
     │  (via meetingInvited sub)     │                            │
     │                                │                            │
     │  7. joinMeeting(meetingId) ──►│                            │
     │  8. getLiveKitToken(roomName)─►│                            │
     │  ◄── token ──────────────────│                            │
     │                                │                            │
     │  9. Rejoint room "meeting-42"  │                            │
     │  ────────────────────────────────────────────────────────►│
     │                                │                            │
     │  10. FLUX MÉDIA direct         │                            │
     │  ◄══════════════► audio/vidéo ═══► (SFU relay)            │
     │                                │                            │
     │  11. leaveMeeting(meetingId)  ──►                          │
     │  12. Se déconnecte LiveKit     │                            │
     │  ────────────────────────────────────────────────────────►│
```

**Ce qui disparaît avec LiveKit :** `sendMeetingSignal` et `meetingSignal` (signalement WebRTC custom). LiveKit gère tout le signalement ICE, SDP, TURN.

### Fichiers à créer / modifier

**Nouveaux fichiers :**
```
docker-compose.livekit.yml          → Conteneur LiveKit
livekit.yaml                        → Configuration LiveKit
server/src/livekit/token.ts         → Utilitaire génération token
client/src/components/meeting/
  ├── MeetingRoom.tsx                → Salle audio/vidéo complète
  ├── CallButton.tsx                 → Bouton d'appel (profil/chat)
  └── IncomingCall.tsx              → Notification appel entrant
```

**Fichiers à modifier :**
```
server/src/graphql/resolvers/meeting.ts   → Ajouter getLiveKitToken, simplifier
server/src/graphql/schema/typeDefs.ts     → Ajouter type LiveKitCredentials + mutation
server/src/graphql/context.ts             → Ajouter env vars LiveKit
client/src/store.ts                       → Ajouter credentials meeting
.env                                       → LIVEKIT_URL, LIVEKIT_KEY, LIVEKIT_SECRET
package.json                               → + livekit-server-sdk
client/package.json                        → + livekit-client, @livekit/components-react
```

**Fichiers à simplifier :**
```
sendMeetingSignal (mutation)       → supprimer (obsolète)
meetingSignal (subscription)       → supprimer (obsolète)
```

### Packages npm

```bash
# Serveur
npm install livekit-server-sdk

# Client
cd client
npm install livekit-client @livekit/components-react @livekit/components-styles
```

### Variables d'environnement

```
LIVEKIT_URL=wss://localhost:7880
LIVEKIT_KEY=MINISOCIAL_DEV
LIVEKIT_SECRET=<secret généré aléatoirement>
```

### Intégration avec le système existant

Le schéma SQL actuel (`meetings`, `meeting_participants`) **reste inchangé** :
- `createMeeting` crée la salle et notifie via pubsub
- `joinMeeting` / `leaveMeeting` gèrent les participants dans SQL
- `getLiveKitToken` est la NOUVELLE mutation qui remplace `sendMeetingSignal`

Un appel = 1 meeting dans SQL + 1 room LiveKit (même ID, préfixé `meeting-`). La durée de vie de la room LiveKit est celle de la participation des utilisateurs.

---

## 10. Compatibilité entre les sept systèmes

| | FTS5 | E2EE | Follows | Feed hybride | Messagerie | LiveKit |
|---|---|---|---|---|---|---|
| **FTS5** | — | ✅ | ✅ | ✅ | ✅ | ✅ |
| **E2EE** | ✅ | — | ✅ | ⚠️ pas dans les messages | ✅ | ✅ |
| **Follows** | ✅ | ✅ | — | ✅ (signaux 1 et 5) | ✅ (demandes) | ✅ |
| **Feed hybride** | ✅ | ✅ | ✅ | — | ⚠️ pas dans les posts | ✅ |
| **Messagerie** | ✅ | ✅ | ✅ | ⚠️ | — | ✅ |
| **LiveKit** | ✅ | ✅ | ✅ | ✅ | ✅ | — |

## 11. Ordre de priorité recommandé

1. **Table follows + bouton Suivre/Ne plus suivre** — maintenant (bloquant pour l'algorithme et la messagerie)
2. **Refonte page profil** — maintenant (design tabs + cover + avatar + stats)
3. **Appels audio/vidéo (LiveKit)** — maintenant (infrastructure Docker + token + composants de base)
4. **Inbox/Requests + rate limiting** — maintenant (empêche le spam, améliore l'expérience)
5. **Feed intelligent (règles)** — après follow (alimenté par les 5 signaux)
6. **FTS5** — ensuite (recherche plein texte)
7. **E2EE** — après (protection des messages)
8. **Trust levels** — plus tard (améliore le spam score)
9. **Migration PostgreSQL** — avant pgvector
10. **pgvector** — en dernier

---

## 12. UX/UI du feed — État des lieux et priorités

### 12.1 État actuel

Le feed MiniSocial est fonctionnel mais **minimal** :

```
[Composer]                          ← création de post
┌────────── PostCard ────────────┐  ← un seul type de carte
│  Avatar  Nom  · 3h             │
│  Titre (gras)                  │
│  Contenu (tronqué 150 car.)    │
│  [image]                       │
│  ─────────────────              │
│  ♥ like  💬 comment  ↗ share  │  ← pas de save
└────────────────────────────────┘
┌────────── PostCard ────────────┐
│  ...                           │
└────────────────────────────────┘
```

**Ce qui est bon** (à garder) :
- Optimistic UI sur toutes les actions (like, comment, delete, edit)
- Cache Apollo chirurgical (`cache.modify`) — pas de re-fetch brutal
- Commentaires threadés avec `replyTo`
- Truncation "Voir plus" si contenu > 150 chars
- Mode édition inline
- Subscriptions temps réel (nouveau post, commentaire, like)

**Ce qui manque :**

| Manque | Problème |
|---|---|
| **Skeleton loading** | "Chargement..." textuel = perçu comme lent, pas de placeholder visuel |
| **Pagination / infinite scroll** | Tout le payload en un coup → problème si le volume grossit |
| **Bouton Save / Bookmark** | Signal d'engagement fort absent ; pas de moyen de marquer un post en favori |
| **Like animé** | Toggle sec sans feedback visuel |
| **Aucune variété de format de post** | Un seul template de carte pour tous les contenus |

### 12.2 Ce qu'on NE fait PAS (parce que réseau textuel)

| Pattern | Raison de l'exclusion |
|---|---|
| **Tabs "Pour toi" / "Abonnements"** | Inutile tant que le volume de posts est faible ; le Following feed = le feed intégral. Twitter/X peut le faire parce qu'il a des millions de posts/minute. Pas MiniSocial. |
| **Stories** | Le format story (24h éphémère) est contre-nature pour du texte. LinkedIn a essayé → abandonné. Twitter a essayé (Fleets) → fermé après 8 mois. Le texte a besoin de persistance et lecture différée. |
| **Reels / vidéo courte** | Hors scope d'un réseau textuel. |

### 12.3 Priorité d'amélioration du feed

| Priorité | Action | Effort | Impact |
|---|---|---|---|
| **1** | **Skeleton loading** (shadcn `skeleton.tsx` existe déjà) | Trivial | Fort (perception de performance) |
| **2** | **Pagination / infinite scroll** | Moyen | Fort (scalabilité) |
| **3** | **Bouton Save/Bookmark** avec son compteur | Faible | Moyen (signal engagement > like) |
| **4** | **Animation like** (bounce + remplissage) | Trivial | Faible (plaisir utilisateur) |
| **5** | **Séparation des types de posts** (text vs image vs long-form) | Moyen | Moyen (lisibilité) |
