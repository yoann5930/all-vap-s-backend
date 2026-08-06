# Médiathèque produits All Vap's

Structure :

```
public/media/products/
├── {fabricant}/
│   └── {gamme}/
│       └── {format}/          # 10ml | 50ml | 100ml
│           ├── {produit}.webp
│           └── {produit}-thumb.webp
└── _raw/                      # originaux téléchargés (non retouchés)
```

Règles :
- Une image = une référence produit
- Sources : packshots locaux Fabricants/ OU site officiel fabricant uniquement
- Jamais d’image générée, jamais de revendeur, jamais d’autre fabricant
- Fond premium All Vap’s appliqué sans modifier le packaging

Script : `npx tsx --env-file=.env scripts/build-official-phototheque.ts`  
Rapport : `data/phototheque/RAPPORT_PHOTOTHEQUE.md`
