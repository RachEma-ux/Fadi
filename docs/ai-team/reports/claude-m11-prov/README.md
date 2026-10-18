# Remise Claude Code — vérification #169/#171, ADR-01/02 (ADR-STUDIO-NAV-01) et PROV-03 à PROV-05

**Annonce :** [#166/6251022689](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6251022689). **Exécutant :** Claude Code, hors équipe Codex. **Code lu :** `main@817bd36e7d4b1ab60ab9c00309509c7cdfed0798`. **Date :** 18 octobre 2026.

## Contenu

| Livrable | Rôle |
|---|---|
| [`../claude-verif-169-171/README.md`](../claude-verif-169-171/README.md) | Vérification indépendante des deux lots de code autorisés. Contre-épreuves, fusions locales avec `main`, résolution `ci.yml` proposée et non poussée. |
| [`../../../continuity/decisions/ADR-STUDIO-NAV-01.md`](../../../continuity/decisions/ADR-STUDIO-NAV-01.md) | ADR-01 : décision d'intégration ouverte, statut **Proposé**. ADR-02 : routes, contexte, droits, mobile / plein écran, coexistence (accueil des règles COEX-05/06 sous réserve) et tests NAV. |
| [`PROV-03-05.md`](PROV-03-05.md) | Contrôles de provenance, exécutés par script |
| [`DELTA-REGISTRE-PROPOSE.json`](DELTA-REGISTRE-PROPOSE.json) | 5 changements proposés, **non appliqués** |

## Statuts proposés

| ID | Actuel | Proposé | Preuve |
|---|---|---|---|
| ADR-01 | À définir | Vérifié (documentaire) | ADR ouverte, sans remplacer de DEC ; l'arbitrage reste à ADR-03 |
| ADR-02 | À définir | Vérifié (documentaire) | Les six sujets demandés sont documentés avec leurs sources ; aucun NAV n'est exécuté |
| PROV-03 | À définir | Vérifié (documentaire) | Aucune occurrence de `5cf61d1` n'est présentée comme le HEAD actuel |
| PROV-04 | À définir | Vérifié (documentaire) | Les 10 chemins du Plan sont présents ; empreintes REF-01 et REF-02 conformes ; `3bcda929` reste historique |
| PROV-05 | À définir | Vérifié (documentaire) | V1.0 et V1.1 : 630 IDs, ordre et libellés identiques, aucune renumérotation |

Les vérifications de #169 et #171 ne changent aucun statut de registre : ces lots sont suivis par leurs PR et par #157 / #170.

## Intégration par A0 : les trois remises Claude

```bash
D=docs/ai-team/reports
python3 docs/ai-team/tableau_registre.py --delta $D/claude-m13-rep/DELTA-REGISTRE-PROPOSE.json \
  --delta $D/claude-m13-coex/DELTA-REGISTRE-PROPOSE.json --delta $D/claude-m11-prov/DELTA-REGISTRE-PROPOSE.json   # + --ecrire après revue
```

Essai sur une copie temporaire du dépôt : `DELTA_VALIDE : 3 delta(s), 20 changement(s)`. Après écriture, le registre compte 183 À définir / 191 En cours / 207 Bloqué / 47 Vérifié / 2 Accepté, soit **P630 = 49/630 = 7,8 %**. Ce sont des conditions documentaires : PDEV reste N/D, aucune case n'est cochée et rien n'est « Accepté ».

## Contrôles exécutés

| Contrôle | Résultat |
|---|---|
| Liens `817bd36` (existence du fichier et bornes de lignes) et liens relatifs de toutes les remises Claude et de l'ADR | 94 liens au `817bd36` et 44 liens relatifs, 0 erreur |
| `check-continuity` et ses 8 tests | OK |
| Tests documentaires `docs/ai-team/test_*.py`, couverture 630, `--controle`, isolation | Voir le commit ; relancés avant le push |

## Limites

- Le registre, les STATUS / HANDOFF, les workflows et les branches des PR n'ont pas été modifiés.
- L'ADR n'est pas acceptée.
- Aucun code Studio n'existe ni n'est autorisé par cette remise.
