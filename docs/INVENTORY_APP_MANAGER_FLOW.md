# Inventaire App — Flux responsable / admin

1. `/admin/inventaires` — liste (filtre SOUMIS / VALIDÉ / …)
2. Détail session — lignes, photos, audits, écarts
3. Corriger une ligne (motif obligatoire)
4. **Valider** (statut `VALIDATED`) — toujours sans écrire le stock
5. **Appliquer les corrections au stock** — confirmation + `confirmToken`
6. Session → `CORRECTED`, `stockAppliedAt` posé
7. Double apply → HTTP 409

SumUp : lecture seule via adapter ; **aucune écriture SumUp** dans cette mission.
