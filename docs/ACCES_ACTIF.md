# Accès inventaire — domaine officiel allvaps.fr

Mis à jour : 2026-08-05

## Domaine propriétaire

**allvaps.fr** (All Vap's) — DNS OVH — site vitrine `https://www.allvaps.fr` (Vercel).

## URL inventaire FIGÉE (jamais changer)

**https://inventaire.allvaps.fr**

| Page | Lien |
|---|---|
| Accueil accès | https://inventaire.allvaps.fr/acces |
| Login | https://inventaire.allvaps.fr/login?next=/inventaire |
| Inventaire employés | https://inventaire.allvaps.fr/inventaire |
| Admin inventaires | https://inventaire.allvaps.fr/admin/inventaires |

Source : `data/FIXED_TUNNEL_URL.txt`

## DNS à créer chez OVH (une fois)

| Type | Nom | Cible | TTL |
|------|-----|--------|-----|
| CNAME | `inventaire` | `cname.vercel-dns.com.` | 300 |

Ensuite : Vercel → Domains → ajouter `inventaire.allvaps.fr` → Deploy production de ce repo.

> Tant que le CNAME n’est pas créé, `inventaire.allvaps.fr` ne résout pas.
> Après deploy, `/inventaire` fonctionne aussi sur `https://www.allvaps.fr/inventaire` (même app).

## Comptes (emails)

| Personne | Email | Rôle |
|---|---|---|
| Lilie Froment | `lilie.froment@allvaps.fr` | EMPLOYEE |
| Kelli Fasolla | `kelli.fasolla@allvaps.fr` | EMPLOYEE |
| Aurélien Daillez | `aurelien.daillez@allvaps.fr` | EMPLOYEE |
| Yoann | `yoann@allvaps.fr` | ADMIN |

Mots de passe temporaires remis à Yoann hors Git (fichier local `.local/`).
