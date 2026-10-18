# A6 — M09 : état GitHub des contrôles existants, lecture seule

Complément factuel au dossier canonique A5 `docs/ai-team/reports/mission-004/A5/M09-LOT-A3-CSP-SCAN-PRET-A-AUTORISER.md`, lu et réutilisé. Aucun second registre sécurité ni nouveau scanner. Horodatage précis dans JSON joint ; référence main **a4caaab0e6665480f09febe3914c960b424b6b47** recontrôlée.

## Ce qui a été réellement accessible

GET métadonnées du dépôt : public, branche défautmain ; **security_and_analysis absent de la réponse**. État de chaque fonctionnalité sécurité donc inconnu, pas déclaré disabled. GET contents/.github au SHA courant : ISSUE_TEMPLATE, PULL_REQUEST_TEMPLATE.md et workflows ; aucun dependabot.yml/yaml dans cette liste. Les fonctionnalités par configuration serveur ou intégrations externes ne sont pas exclues par cette absence.

Cinq workflows versionnés de main lus intégralement via GET contents au SHA exact : audit-drawall, builder-deploy, ci, continuity, fadi-isolation. Blobs identifiés dans JSON. Aucun workflow dédié Dependabot/CodeQL/dependency-review/OSV/Trivy/Grype/Gitleaks/Semgrep identifié ; recherche nominale dans le contenu sans exécuter d’outil. CI npmci utilise no-audit : ce n’est pas un résultat de scanner. Les contrôles d’isolation, continuité et imports de Fadi ne sont pas des scans de vulnérabilités. Les workflows supplémentaires des PR non fusionnées ne sont pas présentés comme présents dans main.

## Alertes déjà existantes : statut inconnu, pas zéro

Une lecture demandée pour Dependabot open et une pour code-scanning open : chacune **rejetée par le connecteur avec HTTP400 INVALID_ARGUMENT, endpoint hors liste autorisée**. Aucun retour GitHub403 effectivement observé ; ne pas attribuer à GitHub une permission refusée que l’appel n’a pas atteinte. Aucun nombre, sévérité ou détail d’alerte obtenu ; comptes publics null/inconnus, jamais0.

La collection actions/workflows a également été rejetée une fois par le wrapper ; la lecture alternative autorisée de contents/.github/workflows a permis l’inventaire des fichiers sans administration. Les familles d’alertes n’ont pas été contournées via CLI, token, endpoint privé ou requêtes répétées. Aucune activation ni nouveau scan ni recherche d’advisory externe. Aucun détail confidentiel republié.

## Conséquence et prochaine action bornée

État vulnérabilités **NOT_SCANNED** par cette intervention ; absence d’alertes accessibles ≠ absence de vulnérabilités. Métadonnées partielles ≠ état effectif complet GitHub. A0/A5 gardent SCAN-A/B/C et CSP du dossier existant avec leurs accords séparés ; ne pas lancer npm audit ou CodeQL pour combler l’accès manquant.

Si nécessaire, un administrateur peut fournir **une lecture/export expurgé existant** des fonctionnalités et comptes d’alertes (horodatage, branche/SHA et portée), sans activer d’option ni créer de scan. Cette demande de preuve ne requiert aucun secret. A0 intègre ces limites au même dossier M09 ; aucun verdict sécurité global, aucune fusion/production ou action de remédiation déduit.

## Traçabilité parallèle, sans jugement des oracles

REVUE-TRACABILITE-COHORTES-UNITE-E2E.json : cohorte A2 unités017–039, hash annoncé confirmé, **20 sources/hash/blobs et569 lignes exactes** confrontés au codea15d650 ; cohorte A4 E2E024–045, **83 références hash,12 lignes,71 extraits et1mappinglocal** confrontés.38 sources Git distinctes au total, zéro discordance. Parsing/hash/citations seulement, aucun test ou scénario exécuté ; aucune décision de couverture métier à la place d’A5, aucun mapping125 ou fichier source modifié.
