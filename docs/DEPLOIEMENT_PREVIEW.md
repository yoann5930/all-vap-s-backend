# Preview déploiement

**Date :** 2026-08-06

## Contexte

Le commit de référence localhost `d5a6490` est **déjà** le dernier déploiement Production Vercel.

| Champ | Valeur |
|---|---|
| SHA | `d5a64904ce789119745f885d72e3ff07a7498843` |
| Production deployment GitHub | id `5778338241` (2026-08-06T11:15:12Z) |
| Preview deployment même SHA | id `5778313875` |
| Environment URL (status) | `https://all-vap-s-backend-pdjw8klif-yoann3.vercel.app` |
| Domaine canonique | `https://www.allvaps.fr` (apex `allvaps.fr` → 308) |

## Décision Preview

**Pas de nouveau Preview** créé : republier le même SHA n’apporte aucun delta UI et augmente le risque opérationnel sans bénéfice.

Contrôles effectués directement sur la Preview/Production existante du SHA `d5a6490` + captures Playwright.

## Ce qui n’a PAS été promu

- Seed DEMO local
- Branches PR #4 / #5 / #6 / #3 (hors process localhost courant)
- Toute migration Prisma nouvelle (aucune)
