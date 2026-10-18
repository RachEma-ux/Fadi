# Studio — maquettes documentaires M004/A4

18 octobre 2026 ; D07 retenu pour spécifications. **Ces schémas Markdown statiques ne sont ni une nouvelle application, ni une implémentation, ni une revue UI utilisateur passée.** Ils montrent le placement et les états à contractualiser avec A2/A5 ; aucun moteur, aucune donnée réelle et aucune action API. Les quatre domaines et deux planches ne sont pas des boutons factices présentés comme un MVP.

## 1. Accueil Studio desktop : aucun projet choisi

```text
┌────────────┬──────────────────────────────────────────────────────────┐
│ Fadi       │ Studio                                  FR/EN   Compte  │
│ Accueil    ├──────────────────────────────────────────────────────────┤
│ Projets    │ Concevoir une étude dans un projet Fadi                  │
│ STUDIO ◀   │ [Choisir un projet autorisé ▾]                           │
│ Collabor.  │ Dernier projet : suggestion à vérifier                   │
│            │ Études accessibles                 [Créer une étude]    │
│ Biblio.    │ Aucun projet choisi : aucune géométrie créée             │
│ Paramètres │ [Retour Accueil]                                        │
└────────────┴──────────────────────────────────────────────────────────┘
```

Studio après Projets, actif global unique ; création inactive avec motif tant que projet/droit non validé. Aucun contexte « dernière session » ne remplace une URL explicite. État sans étude et état sans variante distincts. Chargement : statut accessible à la place de la liste, navigation conservée. Refus : « Ressource introuvable ou inaccessible », aucun nom secret.

## 2. Variante — 2D ou 3D indépendantes

```text
┌────────────┬──────────────────────────────────────────────────────────┐
│ Accueil    │ Projet P / Étude S / Variante V / Travail R              │
│ Projets    │ [Local durable, confirmation en attente]  [Plein écran] │
│ STUDIO ◀   ├──────────────────────────────────────────────────────────┤
│ Collabor.  │ DESSIN/MODÉL. | BIM/COORD. | VISUALIS. | DOCUMENTATION    │
│            ├──────────────────────────────────────────────────────────┤
│            │ [Planche 2D] [Planche 3D]  [Outils ▾] [Rechercher]       │
│            │ Outils nommés, icônes propres, raccourcis + tactile     │
│            │ ┌──────────────────────────┐ ┌───────────────────────┐ │
│            │ │ Surface de travail       │ │ Propriétés/contexte   │ │
│            │ │ preview ≠ objet engagé   │ │ Associé / référence / │ │
│            │ │ sélection + focus visibles│ │ copie indépendante   │ │
│            │ └──────────────────────────┘ └───────────────────────┘ │
│            │ [Annuler] [Rétablir]  [État / erreurs / synchronisation] │
└────────────┴──────────────────────────────────────────────────────────┘
```

Changer 2D/3D n'est pas convertir les données. Une nouvelle étude peut commencer sur chaque planche sans l'autre. À l'ouverture de variante sans planche : choix explicite, pas de création cachée. L'interface montre « à résoudre » pour référence ambiguë. Les autres domaines n'affichent pas un troisième éditeur autoritaire.

## 3. Mobile / clavier / plein écran

```text
┌───────┬──────────────────────────┐
│ Fadi  │ P / S / V / R            │
│ ☰     │ Studio  • pending local  │
│ Home  ├──────────────────────────┤
│ Proj. │ Domaines [Dessin ▾]      │
│Studio◀│ [2D] [3D] [Outils ▾]     │
│ ...   │                          │
│       │ Planche                  │
│       │                          │
│       │ [Propriétés] [Annuler]   │
│       │ [État synchro]           │
└───────┴──────────────────────────┘
```

Rail adaptatif identique à Fadi ; dépliage donne texte Studio ; cible tactile proposée >=44px. Panneau propriétés superposé refermable, aucun overflow horizontal global. Barre locale peut défiler sans déplacer le repère du dessin. Clavier : skip-link, Tab/focus visible, entrées menus avec flèches, pas de raccourci dessin capturé dans la saisie numérique/texte. Focus entre planches annoncé et visible.

Plein écran explicite : remplacer l'enveloppe visuelle par la planche avec **« Quitter le plein écran » toujours visible**, contexte et pending conservés. Sortie système/rotation/clavier virtuel ne font perdre ni bouton de sortie ni queue. Refus Fullscreen API garde le mode normal utilisable. Échap peut d'abord annuler preview/menu : sortie visible reste indépendante.

## 4. Transition avec travail non confirmé

```text
Vous avez des commandes conservées sur cet appareil,
mais non confirmées par le serveur pour P / S / V.

[Rester] [Attendre la confirmation] [Quitter en conservant le travail local]
```

Troisième choix offert seulement si la durabilité/reprise est prouvée selon contrat M17 ; sinon Rester et récupération explicitement sûre. Ne pas présenter « Quitter et enregistrer » comme confirmation centrale. Un geste non engagé reçoit Annuler le geste puis quitter/Rester ; conflit reçoit Résoudre/Rester, jamais Publier implicitement. Ces dialogues ne garantissent pas à eux seuls reprise après crash mobile : celle-ci appartient à la persistance.

## 5. Auth expirée et deep link

```text
Session expirée — vos commandes locales de ce compte restent en attente.
[Se reconnecter]  [Rester / consulter les informations non sensibles]
```

Pas d'envoi sous un autre compte ; affichage des contenus sensibles selon politique A2/A5, pas simple cache de la dernière page. URL interne conservée, hiérarchie/droits relus après login. Projet interdit → message neutre, pas de bascule silencieuse vers projet précédent.

## 6. Revue, approbation et publication — permissions séparées

```text
Dossier candidat D — manifeste M — versions R2 / R7 — empreintes identifiées
Contrôles : terminés / non testé / échec (distincts du verdict métier)
Observations bloquantes : liste et responsable

[Soumettre à revue]   [Approuver]   [Publier]
                      permission A  permission P + approbation de M valide
```

Boutons offerts selon droit/motif ; serveur reste autorité. Un rôle possédant A n'a pas P implicitement ; cumul explicite autorisé et tracé seulement. Modifier une pièce après approbation crée un nouveau candidat, bloque publication sous ancien manifeste. Le statut « publié » n'est ni la coche Code ni la revue administrative de la checklist630.

## 7. Révision historique

```text
Consultation — Révision R1 immuable — publiée dans dossier D1
[Reprendre le travail courant] [Créer variante selon droits] [Retour étude]
```

Aucune auto-mutation de R1. Les futurs résultats calculés restent attachés à leur révision source, pas repeints comme courants. Cette maquette ne promet pas migration/restauration exécutée.


## 8. Étude sans variante — cadrage, sources et variantes (ROUTE-03)

```text
Projet P / Étude S                          [Retour au projet]
[Cadrage]  [Sources de l’étude]  [Variantes]

Cadrage : objet / hypothèses / référents / contexte autorisé
Sources : liste des pièces autorisées, version et disponibilité
          [Consulter] [Provenance] [Lier une source] [Importer une source]
Variantes : Aucune variante pour cette étude
            [Créer une variante]  (si droit ; sinon motif de lecture seule)
```

Les sources réutilisent le catalogue Fadi ; provenance et permissions de chaque pièce sont visibles/vérifiées selon contrat. Une pièce inaccessible n’expose ni nom ni aperçu. Les boutons rattachement/import sont des intentions explicitement confirmées ; aucun import réel exécuté ici, aucune conversion BIM implicite. Source indisponible reste identifiée, pas remplacée silencieusement. La zone Variantes reste navigable dès l’état vide, sans création de géométrie. Pending d’import suit la garde de transition de l’étude d’origine. Cette maquette est descriptive, pas une fonctionnalité livrée ni une preuve de G1.
