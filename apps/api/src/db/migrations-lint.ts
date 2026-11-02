/**
 * BD-2.5 (chantier base-donnees) : contrôle des migrations numérotées, sans dépendance externe (rôle de squawk).
 * Chaque règle refuse une opération qui bloque le trafic ou détruit des données sur une table existante, sauf marqueur
 * explicite `-- bd: <raison>` qui documente le choix dans le fichier lui-même. Règles et raisons : migrations/README.md.
 */

export interface Probleme {
  fichier: string;
  regle: string;
  message: string;
}

const sansCommentaires = (sql: string) => sql.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
const marqueur = (sql: string, nom: string) => new RegExp(`--\\s*bd:\\s*${nom}\\b`, "i").test(sql);

/** Tables créées par le fichier lui-même : leurs index et contraintes ne bloquent personne. */
function tablesCreees(code: string): Set<string> {
  const out = new Set<string>();
  for (const m of code.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?("?\w+"?)/gi)) out.add(m[1]!.replaceAll('"', "").toLowerCase());
  return out;
}

export function controlerMigration(fichier: string, sql: string): Probleme[] {
  const p: Probleme[] = [];
  const ajouter = (regle: string, message: string) => p.push({ fichier, regle, message });
  const code = sansCommentaires(sql);
  const concurrent = fichier.endsWith(".concurrent.sql");
  const creees = tablesCreees(code);

  if (/^\s*(BEGIN|COMMIT|ROLLBACK)\b/im.test(code)) ajouter("transaction", "pas de BEGIN / COMMIT / ROLLBACK : l'exécuteur gère la transaction.");

  if (concurrent) {
    for (const instr of code.split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean)) {
      if (!/^(CREATE\s+(UNIQUE\s+)?INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS|DROP\s+INDEX\s+CONCURRENTLY\s+IF\s+EXISTS|REINDEX\s+INDEX\s+CONCURRENTLY|ANALYZE)\b/i.test(instr)) {
        ajouter("concurrent", `fichier .concurrent.sql : seulement CREATE INDEX CONCURRENTLY IF NOT EXISTS, DROP INDEX CONCURRENTLY IF EXISTS, REINDEX INDEX CONCURRENTLY ou ANALYZE (reçu : ${instr.slice(0, 60)}…)`);
      }
    }
    return p;
  }

  if (/\bCONCURRENTLY\b/i.test(code)) ajouter("concurrent", "CONCURRENTLY est impossible dans une transaction : utiliser un fichier NNNN_nom.concurrent.sql.");

  for (const m of code.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?\S+\s+ON\s+(?:ONLY\s+)?(?:public\.)?("?\w+"?)/gi)) {
    const table = m[1]!.replaceAll('"', "").toLowerCase();
    if (!creees.has(table)) ajouter("index-bloquant", `CREATE INDEX sur la table existante ${table} bloque les écritures : le mettre dans un fichier .concurrent.sql.`);
  }

  for (const m of code.matchAll(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\.)?("?\w+"?)([\s\S]*?);/gi)) {
    const table = m[1]!.replaceAll('"', "").toLowerCase();
    const corps = m[2]!;
    if (creees.has(table)) continue;
    if (/ADD\s+(CONSTRAINT\s+\S+\s+)?(FOREIGN\s+KEY|CHECK)\b/i.test(corps) && !/NOT\s+VALID/i.test(corps)) {
      ajouter("contrainte-validee", `${table} : ajouter une clé étrangère ou un CHECK avec NOT VALID, puis VALIDATE CONSTRAINT dans une migration suivante.`);
    }
    if (/ALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b/i.test(corps) && !marqueur(sql, "reecriture")) {
      ajouter("type-colonne", `${table} : changer le type d'une colonne réécrit la table sous verrou exclusif ; préférer expand/contract (ou marqueur « -- bd: reecriture »).`);
    }
    if (/SET\s+NOT\s+NULL/i.test(corps) && !marqueur(sql, "not-null-valide")) {
      ajouter("not-null", `${table} : SET NOT NULL parcourt la table sous verrou exclusif ; valider d'abord un CHECK (col IS NOT NULL) NOT VALID, puis marqueur « -- bd: not-null-valide ».`);
    }
    if (/ADD\s+COLUMN[\s\S]*DEFAULT\s+(now|clock_timestamp|random|gen_random_uuid|uuidv7|timeofday)\s*\(/i.test(corps)) {
      ajouter("defaut-volatil", `${table} : une colonne ajoutée avec un défaut volatil réécrit la table ; ajouter sans défaut, poser le défaut, puis remplir par lots.`);
    }
    if (/DROP\s+COLUMN/i.test(corps) && !marqueur(sql, "contraction")) {
      ajouter("contraction", `${table} : DROP COLUMN est une contraction : seulement après la Release qui ne lit plus la colonne (marqueur « -- bd: contraction »).`);
    }
  }

  if (/DROP\s+TABLE/i.test(code) && !marqueur(sql, "contraction")) ajouter("contraction", "DROP TABLE est une contraction : marqueur « -- bd: contraction » après la Release qui ne l'utilise plus.");
  if (/\bTRUNCATE\b/i.test(code)) ajouter("destruction", "TRUNCATE interdit dans une migration.");
  if (/\bVACUUM\s+FULL\b|\bCLUSTER\b/i.test(code)) ajouter("reecriture", "VACUUM FULL / CLUSTER réécrivent la table sous verrou exclusif : opération de maintenance, pas de migration.");
  const ecritures = code.split(/;\s*(?:\n|$)/).some((instr) => /^\s*(UPDATE\s|DELETE\s+FROM\s)/i.test(instr));
  if (ecritures && !marqueur(sql, "reprise")) {
    ajouter("reprise", "UPDATE / DELETE dans une migration : reprise de données à faire par lots (marqueur « -- bd: reprise » avec la borne du lot).");
  }
  return p;
}
