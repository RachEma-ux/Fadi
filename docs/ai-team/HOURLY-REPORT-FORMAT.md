# Fadi — présentation du rapport horaire ChatGPT (mobile, version 1)

**Source :** [programme #156](https://github.com/RachEma-ux/Fadi/issues/156), [questions et relevés #166](https://github.com/RachEma-ux/Fadi/issues/166) et les checkpoints des chantiers `ai-team` et `studio`.
**Usage :** tâche ChatGPT « Avancement horaire Fadi ». Ne pas confondre le panneau « paramètres de la tâche » (qui présente les consignes) et le **rapport envoyé dans le chat**.

## Objectif visuel

Reproduire la présentation de la carte montrée par l'utilisateur le 18 octobre 2026 :
- Un titre lisible : **« N/D % — Avancement du développement total Fadi / Studio »**, ou un pourcentage vérifié si le périmètre de développement `DEV_SCOPE` est ratifié et la preuve disponible.
- Une **seule carte** avec **deux colonnes** : **« Tâches Studio vérifiées »** (par exemple `6 / 630`) et **« Développement total »** (`N/D %` faute de baseline). Une courte ligne secondaire sous chaque chiffre ; ne pas confondre taux documentaire et développement.
- Dans la même carte, un titre **« État des 630 tâches »**, une **barre horizontale segmentée** proportionnelle aux quatre comptes, puis leur **légende sur deux colonnes** avec points de couleur : `À définir`, `En cours`, `Bloquées`, `Vérifiées (documents)`. Ne jamais dessiner une répartition à partir d'un registre indisponible ou ancien sans l'indiquer.
- Après la carte, **au maximum quatre phrases courtes** : « Depuis le précédent contrôle », « Codex et CI », « Questions et décisions », « Prochaine action ». Ajouter les 2 à 4 liens de preuve nécessaires (GitHub #156/#166, PR active, run CI), pas la totalité des instructions.
- Sur mobile : deux colonnes de métriques dans la carte, légende deux colonnes, textes courts ; pas de grand tableau à nombreuses colonnes, pas de bloc JSON/YAML, pas de longue liste d'étapes ni de prompt d'automatisation copié dans le rapport.

## Exemple de présentation (données historiques à remplacer)

> **Cet exemple utilise le relevé historique Mission 003 : 258 à définir, 159 en cours, 207 bloquées, 6 vérifiées documentaires.** Il ne fournit PAS l'état courant ; chaque exécution doit recalculer ou attribuer les valeurs au SHA/source consulté. Ne pas recopier ces chiffres après une progression réelle.

Le système de rendu du chat doit privilégier les composants natifs de grille/carte lorsque disponibles. Exemple de structure :

```text
# N/D % — Avancement du développement total Fadi / Studio

┌────────────────────────────────────┐
│ Tâches Studio     Développement    │
│ vérifiées         total            │
│ 6 / 630           N/D %            │
│ 1,0 % docs        Baseline à établir│
│                                    │
│ État des 630 tâches                │
│ [gris][bleu][orange][vert]         │
│ • À définir : 258  • En cours :159 │
│ • Bloquées :207    • Vérifiées : 6 │
└────────────────────────────────────┘

Depuis le précédent contrôle : ...
Codex et CI : ...
Questions et décisions : ...
Prochaine action : ...
Sources : #156 · #166 · CI (lien)
```

Dans une réponse ChatGPT compatible avec les composants de mise en page : utiliser une carte principale, deux cellules de métriques gris neutre, une barre segmentée de quatre segments dont les largeurs reflètent **exactement** 258/159/207/6 (ou les valeurs actuelles), et une légende de deux colonnes. Ne pas présenter le schéma ASCII lui-même aux utilisateurs : il s'agit uniquement d'un gabarit de disposition.

## Données, règles et preuve

1. À chaque exécution horaire, lire l'état actuel de la PR #165 ou sa version fusionnée, `main` et les runs CI au SHA exact ; lire [Issue #166](https://github.com/RachEma-ux/Fadi/issues/166) ainsi que le registre `docs/workstreams/studio/task-register.json` dans la branche documentée par #165. Identifier **la date et le SHA** du snapshot.
2. Extraire les **630 IDs uniques** du registre lorsqu'il est lisible, puis les statuts. Vérifier que la somme des quatre familles de compteurs est **630** ; si ce n'est pas le cas, ne pas dessiner une répartition trompeuse. Les statuts détaillés supplémentaires doivent être mappés explicitement et traçablement.
3. `P630 = 100 × tâches réellement vérifiées / 630`. Les six tâches documentaires vérifiées en octobre 2026 ne correspondent pas à six fonctionnalités codées. Les 630 affectations vers M00–M30 ne valent pas réalisation.
4. `PDEV = 100 × tâches de développement fonctionnel vérifiées / tâches du DEV_SCOPE accepté` **seulement** avec périmètre, dénominateur et preuves exacts ; sinon **N/D %**, jamais 0 % inventé ou 100 % tiré du mapping.
5. En absence de nouvelle information fiable, **conserver le dernier état vérifié en indiquant sa date**, signaler « aucun progrès nouveau attesté » et éviter toute progression arbitraire. Si le registre ne peut pas être lu, afficher « répartition indisponible » plutôt qu'une barre fictive.
6. Conserver séparément `question ayant reçu une réponse ChatGPT` et `arbitrage/autorisation encore en attente`. Ne pas annoncer le code, une PR ou une activation Codex sans preuve. Le monitoring horaire ne peut pas relancer Codex Cloud ni fusionner une PR.
7. Le rapport doit être en **français**, compact, cohérent et **directement lisible en mode mobile**. L'horodatage suisse et le SHA de référence peuvent tenir en une légende discrète sous la carte.
8. Les questions techniques dans #166 peuvent recevoir une réponse sur GitHub pendant le contrôle ; les décisions déléguées doivent être tracées avec portée et limites. N'afficher que les décisions/actions qui changent réellement le chantier.

## Livrables

- **Dans ChatGPT :** rapport horaire visuel selon le gabarit.
- **Dans #166 :** commentaire `[CHATGPT-HOURLY]` bref, avec indicateurs, SHA et liens de preuve si l'écriture est possible ; il alimente le snapshot quotidien de la checklist HTML. Ne pas y recopier ce gabarit.
- **À ne jamais afficher comme rapport :** le texte complet de la tâche programmée, la liste de toutes les missions, les instructions pour Codex, le JSON de l'automatisation ou les payloads de requêtes.

Le titre de la **tâche planifiée** doit rester court, par exemple « Avancement horaire Fadi ». Son **texte de consignes** est volontairement bref et renvoie au présent fichier pour que l'écran de paramètres ne soit pas rempli d'une instruction de plusieurs pages.
