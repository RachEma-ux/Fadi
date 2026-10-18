# Revue croisée ciblée A4 ↔ 141 fiches A1 — Mission 003

18 octobre 2026. **Revue documentaire et de correspondances uniquement ; aucune revue UI exécutée.** Entrée : `agents/A1/studio-141-fiches.json`, empreinte SHA256 au relevé `c1f2459dc746f5af323b7cc0f116c5f1bf092cdc5c2032ab2059dc51d9871dcf`. Le fichier peut évoluer après cette revue ; revalider l'empreinte à l'intégration. Base de code citée par A1 et A4 : `a09c11d397c8527987c3d1c4410ebb2eb240a819`.

## Contrôles effectués

- Lecture machine des 141 identifiants : 104 EX +15 INV +11 IF +11 AC, uniques. Ce contrôle ne vaut pas revue sémantique exhaustive des 141 obligations.
- Champs d'états de **toutes** les fiches relus : tests `Prescrit, non exécuté`, conformité `Non testé pour Studio`, travail `Préparée pour revue A1/A2/A5 ; non acceptée`. Aucune réalisation Studio dérivée de ces champs.
- Lecture ciblée des textes exacts, contrats et scénarios pour EX-001/003..007/012..019/026..049/058/061/087..092/098/101, INV-005/006/009/011/014/015 et IF-001..011, complétée des liens NAV. Pas de certificat d'exhaustivité normative ; la provenance DOCX complète reste du ressort A1.
- Comparaison avec contrat A4 et neuf fiches NAV, sans renuméroter les sources ; tous les liens sont candidats et partiels selon l'assertion réellement exécutée.

## Résultats et corrections

| Point | Résultat / action |
|---|---|
| EX-001 autonomie et IF-001 rattachement | Alignés NAV-002/003/004 : projet autorisé, contexte explicite, aucun Parcours requis ; routes web proposées ne sont pas l'API existante. |
| EX-003 contexte | Aligné modèle complet avant géométrie ; étude sans variante reste possible ; pas de commande sans propriétaire. |
| EX-004/005/006/007 | Alignés NAV-005 et MVP A/B/C ; accès aux domaines seul ne ferme pas l'autonomie/sauvegarde/publication. |
| EX-036 accessibilité et EX-037 gestes | Alignés NAV-001/005/007 ; alternative clavier, focus visible, saisie numérique/modificateurs préservés ; aucun audit WCAG annoncé. |
| EX-012 immuabilité et EX-016 fraîcheur | Alignés historique et bandeau. **Correction A4 effectuée :** NAV-006 citait EX-013 (clonage), lien trop indirect ; remplacement par EX-003/012/016/087/088/092 et IF-001. EX-014 concerne provenance/unités, pas appartenance : aucun faux remplacement par EX-014. |
| IF-005 Manager et INV-009/014/015 | Alignés M21 : visibilité/disponibilité/droits indépendants ; profil ne modifie données/révision/droits ; offline véridique. |
| IF-004/006/011 | Alignés NAV-007 : baseRevision, idempotence, journal et absence de réadressage ; changement d'écran ne vaut pas engagement serveur. |
| IF-002 fiche A1 | Scénarios 005/008 possibles liens secondaires, mais ne couvrent pas directement exemple Ligne/snapping. **Suggestion transmise à A1 :** ajouter TEST-001/022 et leurs oracles, sans retirer cas métiers utiles. A4 n'a pas modifié la fiche A1. |
| IF-003 fiche A1 | `contrats_candidats` contient IF-004/006/011 mais pas IF-003. **Suggestion transmise à A1 :** lien direct IF-003 et complément IF-007 pour jobs ; pas une erreur du texte normatif extrait, mais traçabilité candidate incomplète. |
| Schéma contexte A2 | A2 confirme routes/domaine/planche et historique readonly ; ajouter `writerAuthority` et `schemaVersion`. **Ajout A4 effectué** dans CONTRAT-NAV-CANDIDAT.md ; ces champs restent logiques proposés, non implémentés. |

Une table de liens candidats directs/complémentaires a été ajoutée en fin de NAV-FICHES.md. Elle n'affirme pas la couverture complète d'une exigence à partir d'un scénario de navigation, en particulier atomicité/restauration/publication. Les plages EX ne sont pas des preuves d'exécution. Les sources EX/IF/INV/AC exactes ne sont pas réécrites.

## Limites et suite

Pas de test UI/navigateur, aucune base ou API métier mutée, aucun code/registre A1 modifié. A1 reçoit les deux propositions de mapping ; son éventuelle mise à jour change l'empreinte ci-dessus et doit être reprise comme version ultérieure. A5 possède les scénarios et preuves de TEST ; A4 ne double pas leur résultat. A0 intègre la contribution avec STATUS/HANDOFF et conserve M002-D07/G1/G3 ouverts jusqu'aux décisions applicables.
