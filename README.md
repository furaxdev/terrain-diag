# Terrain Diag

Application de terrain pour diagnostiqueurs immobiliers indépendants : tournée du jour,
fiches de mission (photos + signature client), et suivi de facturation (« ce qui reste à
réclamer »).

**Sans compte, sans serveur** : toutes les données restent sur l'appareil
(localStorage + IndexedDB). Installable sur téléphone (PWA), fonctionne hors ligne.

## Écrans

- **Journée** — visites du jour triées par heure, statut fait / à faire, montant prévu.
- **Fiche** — client, adresse, diagnostics (montant calculé selon les tarifs), photos,
  constat, réserves, signature du client.
- **Facturation** — missions du mois, facturé / encaissé / **reste à facturer**,
  passage « à facturer → facturé → encaissé », export CSV.
- **Réglages** — cabinet, tarifs par diagnostic, sauvegarde / restauration JSON.

## Ce que ce n'est pas

Pas de moteur de calcul DPE, pas de génération de rapport réglementaire, pas de
synchronisation multi-appareils. Le rapport reste produit par le logiciel du cabinet.

## Technique

HTML/CSS/JS natif, un seul fichier de logique (`app.js`), service worker pour le hors-ligne.
Aucune dépendance, aucun build.
