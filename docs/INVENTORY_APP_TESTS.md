# Inventaire App — Tests

## Automatisés

```bash
npx tsx scripts/test-inventory-stock-gate.ts
```

Couvre : statut SUBMITTED, gate apply-stock, confirmToken.

## Manuels obligatoires (restants)

- [ ] Connexion employé réel
- [ ] Refus client CUSTOMER
- [ ] Création session + scan EAN connu / inconnu
- [ ] Double scan
- [ ] Hors ligne + sync
- [ ] Submit sans changement StockLevel
- [ ] Apply-stock admin une fois
- [ ] Double apply refusée
- [ ] Isolation deux employés
- [ ] Non-régression site / AVA / boutique

## Données métier pendant dev

Prix / EAN / SKU / produits modifiés : **0**  
Stock réel modifié pendant simple comptage : **0**
