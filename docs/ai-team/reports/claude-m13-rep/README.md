# Remise Claude Code — M13 REP-02 à REP-09 et outil de registre

**Programme :** [#156](https://github.com/RachEma-ux/Fadi/issues/156). **Annonce et coordination :** [#166, `[CLAUDE-ACK][M13-REP-02-09]`](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250697907).
**Exécutant :** Claude Code, session distincte de l'équipe Codex A0–A6. Cette remise **n'est pas présentée comme un travail d'A2 ou d'A5**.
**Date :** 18 octobre 2026 (UTC). **Code lu :** `main` = `817bd36e7d4b1ab60ab9c00309509c7cdfed0798`.

## Pourquoi cette remise

L'équipe Codex était à P630 = 34/630. Ses agents étaient occupés par les revues M08, G1 et CLASSIF-1. Les huit tâches REP-02 à REP-09 étaient prêtes : lecture seule, aucune autorisation sensible, aucune dépendance ouverte. Personne ne les avait engagées : elles n'apparaissaient que dans le CSV de la mission 002 et dans le registre. Elles ont été traitées en parallèle, sans toucher aux fichiers dont A0, A3 ou A6 sont propriétaires.

## Contenu

| Fichier | Rôle |
|---|---|
| [`REP-02-08-CONSTATS.md`](REP-02-08-CONSTATS.md) | Constats REP-02 à REP-08 avec liens ligne par ligne au `817bd36`. Blobs identiques au REP-01 `5cf61d1`. |
| [`REP-07-ESSAIS.json`](REP-07-ESSAIS.json) | Essais E0 à E7 de `check-module-deps.mjs`. Un faux négatif est démontré (import relatif vers `apps/api` non détecté), avec 0 occurrence actuelle ; il est déjà corrigé par la PR #152, non fusionnée (E6). |
| [`REP-09-REQUALIFICATION.md`](REP-09-REQUALIFICATION.md) et [`.json`](REP-09-REQUALIFICATION.json) | Les 14 observations de l'annexe A de REF-02, requalifiées. La lecture statique et les tests exécutés sont séparés. |
| [`DELTA-REGISTRE-PROPOSE.json`](DELTA-REGISTRE-PROPOSE.json) | Delta proposé pour le registre 630. Il est **non appliqué** ; A0 l'intègre ou le rejette après revue. |
| [`../../tableau_registre.py`](../../tableau_registre.py) et [`test_tableau_registre.py`](../../test_tableau_registre.py) | Outil de compteurs, de contrôle de cohérence et d'intégration de delta, avec 11 tests unitaires. |

## Verdicts proposés (aucun n'est « Accepté »)

| ID | Statut actuel | Proposé | Nature de la preuve |
|---|---|---|---|
| REP-02 | À définir | Vérifié (examen documentaire) | lecture statique |
| REP-03 | À définir | Vérifié (examen documentaire) | lecture statique |
| REP-04 | À définir | Vérifié (examen documentaire) | lecture statique |
| REP-05 | À définir | Vérifié (examen documentaire) | lecture statique ; E2E citée mais non exécutée |
| REP-06 | À définir | Vérifié (examen documentaire) | lecture statique ; options a/b/c non tranchées |
| REP-07 | À définir | Vérifié (examen documentaire) | lecture + 8 essais exécutés (dont 2 sur le script de #152) |
| REP-08 | À définir | Vérifié (examen documentaire) | lecture + `check-continuity` et 8/8 tests exécutés |
| REP-09 | À définir | Vérifié (examen documentaire) | lecture statique des 14 OBS (13 confirmées, OBS-11 partielle) + 198 tests unitaires purs exécutés |

Si A0 intègre le delta tel quel, le registre passe de 34 à 42 conditions vérifiées : **P630 = 42/630 = 6,7 %**. Ce sont des conditions documentaires ; PDEV reste N/D. Aucune case source n'est cochée et aucune fonctionnalité Studio n'est acceptée.

## Constats saillants pour les lots suivants

1. **REP-06.** Ajouter `studio` à `MODULES` ferait passer Studio par `ProjectShell`, ce que NAV-002 et le Plan §2.1 excluent. L'entrée globale demande un mécanisme distinct, à décider dans ROUTE-09 / ADR-01.
2. **REP-05.** La classe `atelier-immersive` masque la barre latérale. C'est un drapeau global sans compteur. Studio ne doit pas la réutiliser (NAV-008).
3. **REP-04.** `ProjectShell` interroge toujours les étapes du Parcours. En revanche, l'accès, la synchronisation, les verrous et les conflits sont déjà réutilisables sans lui.
4. **REP-07.** Le garde web↔api se contourne par un chemin relatif. La PR #152 (brouillon) le corrige déjà (E6), mais n'ajoute aucune frontière entre modules web (E7) : les règles propres à Studio restent à décider.
5. **REP-02.** Le repli `*` envoie vers `/accueil` sans message, et il n'y a aucune `ErrorBoundary` autour des morceaux chargés à la demande. Les deux points sont à couvrir par NAV-004 et NAV-008.
6. **#142 / #152.** La PR #142, ouverte et en retard de 98 commits sur `main`, supprime le masquage automatique de l'enveloppe (REP-05) et réorganise `ProjectShell` (REP-04). Si elle est fusionnée, REP-04 et REP-05 sont à relire sur sa tête. Détail dans [`REP-02-08-CONSTATS.md`](REP-02-08-CONSTATS.md#impact-des-pr-ouvertes-142-et-152-non-modifiées).

## Pour A0 : intégrer en une commande

```bash
python3 docs/ai-team/tableau_registre.py --delta docs/ai-team/reports/claude-m13-rep/DELTA-REGISTRE-PROPOSE.json           # validation, aucune écriture
python3 docs/ai-team/tableau_registre.py --delta docs/ai-team/reports/claude-m13-rep/DELTA-REGISTRE-PROPOSE.json --ecrire  # après revue A2/A5
python3 docs/ai-team/tableau_registre.py --controle   # signale les phrases de compteurs STATUS/HANDOFF à actualiser
```

L'intégration refuse le delta si :

- le registre a changé depuis sa préparation (empreinte `base_register_sha256`) ;
- un `statut_avant` ne correspond plus ;
- une preuve n'a pas de limite déclarée ;
- le delta prétend accepter, ou cocher une case source.

## Ce que l'outil fait gagner à chaque checkpoint

- Les compteurs et P630 sont recalculés depuis le registre. Aujourd'hui, ils sont recopiés à la main dans quatre fichiers (STATUS et HANDOFF des chantiers `ai-team` et `studio`) et dans `progress.P630`.
- `--controle` signale en une passe tout écart entre le registre, `progress.P630`, l'index M08 (compteur de revues, fichiers référencés) et ces quatre checkpoints. Au `817bd36`, il répond `REGISTRE_COHERENT`.
- `--candidats` liste les 75 tâches ouvertes dont l'intitulé commence par un verbe de lecture ou de consignation. Ce sont des candidates à qualifier, pas des tâches READY déclarées.
- `--delta` permet à un autre agent (Codex ou Claude) de préparer des mises à jour sans écrire le registre partagé. On garde ainsi un écrivain unique (A0) et l'on supprime le travail de recopie.

**Point pour A6 :** la CI lance `test_check_missions.py` seulement (`-p 'test_check_missions.py'`). Pour que `test_tableau_registre.py` tourne aussi en CI, il faut élargir le motif à `test_*.py` dans `ci.yml` et `codex-missions.yml`. Ces fichiers relèvent d'A6 et ne sont pas modifiés ici.

## Contrôles exécutés pour cette remise (au `817bd36`, locaux)

| Contrôle | Résultat |
|---|---|
| `python3 -m unittest discover -s docs/ai-team -p 'test_*.py'` | 25 tests réussis (14 existants + 11 nouveaux) |
| `python3 docs/ai-team/check_missions.py --check` | `CODEX_MISSIONS_COVERAGE_OK` 31 missions, 630/630 |
| `python3 docs/ai-team/tableau_registre.py --controle` | `REGISTRE_COHERENT` |
| `python3 docs/ai-team/tableau_registre.py --delta … ` (validation seule) | `DELTA_VALIDE` |
| `node scripts/check-continuity.mjs` et `node --test scripts/check-continuity.test.mjs` | OK, 8/8 |
| `node scripts/check-fadi-isolation.mjs` | OK |
| `node scripts/check-module-deps.mjs` | OK (E0) |

La CI GitHub n'a pas été observée pour cette remise : aucune PR n'est ouverte, et `ci.yml` ne tourne que sur PR ou sur `main`. **Aucun résultat CI n'est déclaré.**

## Limites

- Ce travail est documentaire et en lecture seule. Il ne modifie aucun code applicatif. Il ne touche à aucune base, API, service ni E2E, et ne fusionne rien.
- `task-register.json`, `STATUS.md`, `HANDOFF.md`, les workflows et les autres fichiers d'A0, A3 ou A6 n'ont pas été modifiés.
- Les numéros de ligne valent pour `817bd36`.
