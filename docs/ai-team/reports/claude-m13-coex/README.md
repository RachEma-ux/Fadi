# Remise Claude Code — M13 COEX-01 à COEX-06 et ADR-04

**Programme :** [#156](https://github.com/RachEma-ux/Fadi/issues/156). **Annonce :** [#166, `[CLAUDE-ACK][M13-COEX-01-06-ADR-04]`](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250925570).
**Exécutant :** Claude Code, session distincte de l'équipe Codex A0–A6 ; ce travail n'est pas présenté comme celui d'A2. **Code lu :** `main@817bd36e7d4b1ab60ab9c00309509c7cdfed0798`. **Date :** 18 octobre 2026 (UTC).

## Contenu

| Fichier | Rôle |
|---|---|
| [`COEX-01-QUALIFICATION.md`](COEX-01-QUALIFICATION.md) et [`.json`](COEX-01-QUALIFICATION.json) | 22 composants de l'Atelier qualifiés **en proposition** : 12 conserver, 4 compléter, 2 corriger, 4 isoler, 0 remplacer, **0 retirer**. |
| [`COEX-02-06-DOSSIERS.md`](COEX-02-06-DOSSIERS.md) | Pour COEX-02 : inventaire de 14 accès historiques et contrat de non-suppression. Pour COEX-03 à COEX-06 : écrivains actuels, options, recommandations et règles à ratifier. |
| [`ADR-04-REGISTRE-RISQUES.md`](ADR-04-REGISTRE-RISQUES.md) et [`.json`](ADR-04-REGISTRE-RISQUES.json) | RISK-01 à RISK-10 recopiés mot pour mot de REF-02 §21.3 (contrôle automatique). Correspondance avec le Plan §10. 7 risques de navigation NAV-R01 à NAV-R07 rattachés, **à titre de proposition**. |
| [`DELTA-REGISTRE-PROPOSE.json`](DELTA-REGISTRE-PROPOSE.json) | 7 changements proposés, **non appliqués**. Leurs IDs sont disjoints du delta REP-02..09. |

## Statuts proposés

| ID | Actuel | Proposé | Pourquoi |
|---|---|---|---|
| ADR-04 | À définir | **Vérifié (documentaire)** | Le registre source est conservé à l'identique et les risques de navigation sont rattachés avec preuves. Les priorités relèvent d'ADR-05. |
| COEX-02 | À définir | **Vérifié (documentaire)** | La prévision est concrète : 14 accès inventoriés et un contrat pour le lot I. NAV-009 n'est pas exécuté. |
| COEX-01 | À définir | En cours | L'intitulé exige une **décision** sur chaque qualification. |
| COEX-03 | À définir | En cours | Il faut **choisir** le propriétaire d'écriture. Recommandation : option A. |
| COEX-04 | À définir | En cours | Il faut **décider** entre redirection et lecture seule. Recommandation : lecture seule par défaut. |
| COEX-05 | À définir | En cours | La règle d'interdiction est à **ratifier**. |
| COEX-06 | À définir | En cours | La porte R1–R3 est à **ratifier**. |

Les questions de décision sont publiées dans [#166](https://github.com/RachEma-ux/Fadi/issues/166) sous `Q-CLAUDE-COEX-01`, `-03`, `-04` et `-05-06`. Une décision rendue permettra de passer l'ID correspondant à « Vérifié » par un nouveau delta.

**Avec les deux deltas Claude intégrés, P630 = 44/630 = 7,0 %**, contre 34 aujourd'hui. Ce sont des conditions documentaires : PDEV reste N/D, aucune case n'est cochée et rien n'est « Accepté ».

## Constats saillants

1. **R9 est déjà l'écrivain unique côté serveur.** Le service de commandes est le seul à écrire le modèle (`lib/atelier-modele.ts`). COEX-03 porte donc sur **quel client** (Atelier ou Studio) a le droit d'émettre des commandes sur quel périmètre, et non sur l'invention d'un nouveau mécanisme.
2. **Les variantes actuelles sont des projets** (`atelier_variants.project_id` / `parent_id`). La Variante Studio de DEC-03 en est distincte. Une correspondance explicite est obligatoire (C19, COEX-04).
3. **Un mode lecture seule existe déjà** (`readOnly`, `protectedReference`). L'option « lecture seule historique » de COEX-04 s'appuie sur ce mécanisme, sans nouveau mode à construire.
4. **Aucun mécanisme actuel n'est une synchronisation artisanale.** La file hors ligne, la mise à jour d'une variante (D-136) et la bascule du lot 4 reposent toutes sur le rejeu validé ou l'import à sens unique. La règle COEX-05 formalise cette pratique pour Studio.
5. **Trois risques source sont absents du tableau du Plan §10 :** RISK-03, RISK-07 et RISK-09. Ils restent actifs.

## Intégration par A0 (après revue A2/A5)

```bash
python3 docs/ai-team/tableau_registre.py \
  --delta docs/ai-team/reports/claude-m13-rep/DELTA-REGISTRE-PROPOSE.json \
  --delta docs/ai-team/reports/claude-m13-coex/DELTA-REGISTRE-PROPOSE.json            # validation seule
#   … puis la même commande avec --ecrire, puis --controle pour lister les phrases STATUS/HANDOFF à actualiser
```

`--delta` est maintenant répétable : les deux remises, préparées sur le même registre, s'intègrent en une seule commande. Un essai complet a été fait sur une **copie temporaire** du dépôt :

- validation : `DELTA_VALIDE : 2 delta(s), 15 changement(s)` ;
- écriture : `DELTA_APPLIQUE` donne 188 / 191 / 207 / 42 / 2 et P630 = 44 ;
- `--controle` signale ensuite les 8 phrases de compteurs à actualiser dans les quatre STATUS / HANDOFF.

Le registre réel n'a pas été modifié.

## Contrôles exécutés (locaux, `817bd36`)

| Contrôle | Résultat |
|---|---|
| Liens `…/817bd36…#Lx-Ly` des deux remises, bornes vérifiées par `git show` | 83 liens ligne et tous les liens relatifs entre fichiers : 0 erreur |
| RISK-01 à RISK-10, comparaison mot pour mot avec l'extraction du Word | 0 écart |
| `python3 -m unittest discover -s docs/ai-team -p 'test_*.py'` | réussi (12 tests de l'outil, dont l'enchaînement de deux deltas) |
| `check_missions.py --check`, `tableau_registre.py --controle`, `check-continuity`, `check-fadi-isolation` | OK |

Aucune CI GitHub n'est déclarée, faute de PR.

## Limites

- Ce travail est une lecture statique. Il n'exécute aucun code applicatif, base, migration ni E2E, et ne fusionne rien.
- Le registre, les STATUS / HANDOFF et les workflows n'ont pas été modifiés.
- Les recommandations sont des propositions. Les décisions COEX appartiennent à l'arbitrage délégué ou au propriétaire.
