# Revue UX — ADR Claude proposée

Source : `b6794c64c7ff98fadf62868331f4297631201069:docs/continuity/decisions/ADR-STUDIO-NAV-01.md`.

Avis favorable à **Vérifié documentaire pour les seules obligations ADR-01/02** : proposition distincte existante, six rubriques présentes et neuf NAV reliés aux contrats. Aucun statut canonique modifié par A4. **ADR-03 reste non décidé ; aucun gate ni code autorisé.**

Les exigences détaillées mobile/clavier/FR-EN, quatre domaines/deux planches indépendantes et états de sauvegarde/conflit/auth restent portées par les références NAV existantes. La table de l’ADR ne remplace pas leurs oracles et ne constitue aucune preuve runtime.

Réserves à conserver avant arbitrage :
- **UX-ADR-R1**, lignes 63,66,130 : E-B(c) « raccourci projet » est ambigu face autonomie D07/§Contexte ; option C finale signifie reporter mécanisme, ce n’est pas identique à E-B(c). Distinguer option de lien global vers /studio d’un raccourci Atelier/projet ; exclure toute dépendance à ProjectShell/étape ou création implicite. Ne pas rouvrir D07.
- **UX-ADR-R2**, lignes 68,138 : Règle Planche icône/barre/raccourci appliquée à toute commande Studio : portée plus large que règle historique Planche. « Aucune règle sans source » est trop absolu pour cette extension. Traiter extension UX comme proposition à arbitrer ; distinguer navigation globale, outils géométriques et actions métier approbation/publication. Ne pas imposer raccourci global conflictuel à chaque action.
- **UX-ADR-R3**, lignes 58,79,80,81,128 : Service commun n’implique pas client unique ; readOnly UI ne prouve pas refus serveur ; aucune synchronisation dans deux sens est plus large que interdiction de bases concurrentes. Maintenir R-AUTORITE/R-REFUS-SERVEUR/R-TRANSFERT de COEX_RESERVES et questions déjà publiées. Option A « telle quelle » n’est pas une ratification préalable.
- **UX-ADR-R4**, lignes 30,62,69,70,89,99,101 : Mobile/clavier/FR-EN/focus, quatre domaines/deux planches indépendantes et états détaillés ne sont pas tous réécrits ; références NAV9/contrat/delta les portent. Conserver les renvois complets lors intégration ; ne pas réduire NAV005 à deux paramètres ou NAV009 à 14 accès. Aucun besoin de dupliquer les pages NAV.
- **UX-ADR-R5**, lignes 16,69,150 : « rien de Studio n’existe » doit se lire comme absence intégration applicative observée au SHA817, pas absence de contrats/documentation. PR142 ouverte est un constat de source, pas vérification GitHub actuelle par A4. Conserver SHA/code séparé et vérifier PR142 sur sa tête au moment de réconciliation ; ne pas annoncer CI verte ni absence globale de capacités réutilisables.

Les empreintes et citations exactes, la correspondance des neuf NAV et les limites figurent dans le JSON. A0 réconcilie avec A2 et Claude ; aucune réécriture ni ADR concurrent produit. Aucun navigateur, test, application, service ou base exécuté.
