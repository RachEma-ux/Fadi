# X.2 — correctifs de revue (vague 9)

Correctifs apportés à X.2 (91c251e) après revue. Les tables `INVARIANTS.md` et `PERMISSIONS.md` sont régénérées et
vérifiées par leurs tests.

## INV-013 : règle exacte de correspondance (`commandes/modification.ts`, `correspondancePolyligne`)

La vérification se fait à **chaque** `studio.dessin.modifier` d'une polyligne, que le nombre de sommets change ou non.

- Lien `vertex-i` (cote) : il est gardé si le sommet i est au même point avant et après. Il suit aussi un sommet
  déplacé, mais seulement si la topologie est inchangée (même nombre de sommets, même état ouvert / fermé) et que ce
  sommet est le **seul** sommet déplacé par la modification : ses voisins et tous les autres sommets restent alors
  inchangés.
- Lien `mid-i` (cote) et segment `i` (cote angulaire) : il est gardé si le segment i a les mêmes extrémités (dans un sens
  ou dans l'autre). Il suit aussi le segment si la topologie est inchangée et que ses deux extrémités sont des sommets
  suivis (un seul sommet déplacé au plus). Le milieu suit alors le segment, renflement changé compris.
- Dans tous les autres cas, le lien est rompu et l'annotation passe « à résoudre », avec sa dernière géométrie et une
  valeur « non évaluée ». C'est le cas d'un sommet retiré et d'un autre ajouté à nombre constant (avant le correctif,
  une cote de 3 m devenait 4 m), d'une polyligne inversée, de plusieurs sommets déplacés à la fois ou d'un sommet inséré.
- Un rang qui n'existe plus, ou un segment devenu courbe pour une cote angulaire, fait refuser la modification, comme
  avant.
- Déclaré : le lien qui reste à une cote **linéaire** « à résoudre » suit encore son sommet (règle ci-dessus). En effet,
  la validation du document (`objets/cote.ts`) exige qu'une extrémité liée soit au sommet lié. Rendre cette cote
  entièrement figée, comme la cote angulaire, demanderait de relâcher cette validation, ce qui sort du périmètre de ce
  lot. Ce lien restant est vérifié lui aussi : renuméroté, il est rompu.

## Base simulée (`apps/api/src/testing/studio-base-simulee.ts`)

- La transaction reçoit un `tx` distinct de `db`. Pendant qu'elle est ouverte, une écriture faite par `db` échoue, et un
  `db.transaction` imbriqué aussi. Un `tx` employé après sa transaction est refusé. Les transactions sont sérialisées et
  annulées par un journal d'annulation. `tx.transaction` sert de point de sauvegarde.
- Les unicités et les déclencheurs sont relus dans `db/init.sql` : une violation d'unicité lève `23505`, et une UPDATE
  ou une DELETE protégée par déclencheur est refusée. `onConflictDoNothing` et `onConflictDoUpdate` ne s'appliquent
  qu'au conflit de leur cible.
- Le rôle de chaque acteur est relu dans la base simulée (`projects.ownerId`, `project_members`). Un nouvel acteur est
  ajouté : « propriétaire pendant le verrou d'un autre ». Le projet `q`, avec une étude et une variante réelles,
  appartient à un autre compte. Les 21 étapes du Parcours sont chargées.
- Limites restantes, déclarées dans l'en-tête du fichier : pas d'`orderBy` ni de `limit`. NOT NULL, CHECK, clés
  étrangères et cascades ne sont pas simulés, ni les verrous de ligne au-delà de la sérialisation. Une lecture par `db`
  pendant une transaction voit les écritures non validées. `execute` (SQL brut) n'a aucun effet.

## INV-010

- L'inventaire couvre tout `src/` (hors tests) : drizzle, SQL brut sur `studio_revisions`, et insertion dans une table
  dynamique. Une seule exception est déclarée : `lib/studio-archive.ts`.
- À l'import d'archive, chaque document de révision passe `validateStudioDocument`. Un seul document invalide fait
  refuser la section entière (422), avant toute écriture.

## Points ouverts (décision du maître d'ouvrage)

- `POST /studies/:studyId/exigences/acceptations` : cellules « à arbitrer » pour le propriétaire pendant le verrou d'un
  autre et pour le propriétaire d'un projet de référence. L'acceptation reste admise dans les deux cas. Le comportement
  n'est pas changé.
- Les routes hors Studio qui touchent des données Studio (`documents.ts`, `projects.ts`, `notifications.ts`) ne sont pas
  couvertes par la matrice : elles relèvent des suites DB-3. La liste est vérifiée par test.
