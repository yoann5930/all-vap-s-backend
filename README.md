# All Vap's — Plateforme E-commerce Full Stack

Boutique en ligne professionnelle pour **All Vap's** (Hautmont & Le Quesnoy).

## Stack

Next.js 15 · TypeScript · Tailwind CSS 4 · Prisma · PostgreSQL · JWT · Viva.com & SumUp

## Démarrage

```bash
npm install
cp .env.example .env
npm run prisma:push
npm run prisma:seed
npm run dev
```

→ http://localhost:3000

**Admin :** `admin@allvaps.fr` / `Admin123!`

## Fonctionnalités

### Boutique
- Catalogue avec filtres avancés, tri, pagination
- Recherche instantanée
- Fiches produits premium (promo, avis, similaires)
- Nouveautés · Meilleures ventes · Promotions

### Compte client
- Connexion / Inscription / Mot de passe oublié
- Historique commandes · Adresses · Favoris
- Programme fidélité · QR Code personnel

### Paiement
- Architecture modulaire `lib/payments/` (Viva.com + SumUp)
- Endpoint unifié `/api/payments/checkout`

### Livraison
- Mondial Relay · Relais Colis · Colissimo · Retrait boutique
- Configuration dans `lib/shipping/`

### Administration
- Dashboard statistiques
- Produits · Commandes · Clients
- Catégories & Marques · Coupons · Bannières · Avis

### IA (architecture préparée)
- Conseil vape · Recommandation e-liquides · Estimation Pokémon
- Stub fonctionnel via `/api/ai` et `/ia`

## Structure

```
app/           Pages & API routes
components/    UI, shop, account, admin
lib/           payments, shipping, ai, products
prisma/        Schema & seed
```

## Build

```bash
npm run build
npm start
```

© All Vap's
