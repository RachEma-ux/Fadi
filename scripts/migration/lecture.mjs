/**
 * Lecture de la base pour la simulation de migration — UNIQUEMENT en lecture.
 *
 * - Copie déclarée : la base lue doit être nommée par l'opérateur (`copieDeclaree`) et ce nom doit être exactement
 *   `current_database()` ; sinon la lecture est refusée avant toute requête de données. Mandat : jamais une base de
 *   production existante, seulement une copie isolée ou une base de recette.
 * - Marqueur de copie posé À LA RESTAURATION : le nom de la base se termine par `_copie`, `_mig` ou `_synth`, OU la base
 *   porte un commentaire contenant `fadi-copie-migration`
 *   (`COMMENT ON DATABASE <copie> IS 'fadi-copie-migration — restaurée le …'`, posé par l'opérateur juste après la
 *   restauration de la sauvegarde). Sans l'un ou l'autre, la lecture est refusée (`COPIE_NON_MARQUEE`) : déclarer le
 *   nom ne suffit pas, une base de production nommée par erreur n'est jamais lue.
 * - Session en lecture seule (`default_transaction_read_only = on`) puis une seule transaction
 *   `REPEATABLE READ READ ONLY` (instantané cohérent) ; `transaction_read_only` est relu avant la première requête de
 *   données, et la transaction se termine par ROLLBACK. PostgreSQL refuse toute écriture dans cette transaction
 *   (SQLSTATE 25006), même si le rôle avait le droit d'écrire.
 * - Seules les requêtes de `REQUETES` (migration-lib.mjs, toutes des SELECT) sont exécutées ; une table absente du
 *   schéma est notée « absente », jamais créée.
 */
import pg from 'pg';
import { REQUETES } from './migration-lib.mjs';

export const SUFFIXES_COPIE = Object.freeze(['_copie', '_mig', '_synth']);
export const MARQUEUR_COPIE = 'fadi-copie-migration';

/** Vrai si la base porte le marqueur de copie : suffixe de nom ou commentaire de base contenant le marqueur. */
export function estCopieMarquee(nom, commentaire) {
  return (typeof nom === 'string' && SUFFIXES_COPIE.some((s) => nom.endsWith(s) && nom.length > s.length))
    || (typeof commentaire === 'string' && commentaire.includes(MARQUEUR_COPIE));
}

export class RefusLecture extends Error {
  constructor(code, message) { super(message); this.code = code; this.name = 'RefusLecture'; }
}

/** Ouvre une session en lecture seule sur une copie déclarée ; rend { client, base, fermer }. */
export async function ouvrirSessionLecture({ connectionString, copieDeclaree }) {
  if (!connectionString) throw new RefusLecture('SANS_BASE', 'DATABASE_URL absente : rien à lire.');
  if (!copieDeclaree) throw new RefusLecture('COPIE_NON_DECLAREE', 'Copie non déclarée : passer --copie <nom-de-la-base> (une copie isolée, jamais une base de production).');
  const client = new pg.Client({ connectionString, application_name: 'fadi-migration-simulation' });
  await client.connect();
  try {
    await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
    await client.query('SET default_transaction_read_only = on');
    const base = (await client.query("SELECT current_database() AS nom, current_user AS role, version() AS serveur, shobj_description((SELECT oid FROM pg_database WHERE datname = current_database()), 'pg_database') AS commentaire")).rows[0];
    if (base.nom !== copieDeclaree) throw new RefusLecture('COPIE_DIFFERENTE', `La base connectée (${base.nom}) n'est pas la copie déclarée (${copieDeclaree}).`);
    if (!estCopieMarquee(base.nom, base.commentaire)) {
      throw new RefusLecture('COPIE_NON_MARQUEE', `La base ${base.nom} ne porte pas de marqueur de copie : son nom doit se terminer par ${SUFFIXES_COPIE.join(', ')} ou elle doit porter un commentaire contenant « ${MARQUEUR_COPIE} » (COMMENT ON DATABASE, posé à la restauration). Lecture refusée.`);
    }
    delete base.commentaire;
    return { client, base, fermer: () => client.end() };
  } catch (err) {
    await client.end().catch(() => undefined);
    throw err;
  }
}

/** Lit toutes les tables de `REQUETES` dans une transaction READ ONLY ; rend { lignes, base, lecture }. */
export async function lireBase({ connectionString, copieDeclaree }) {
  const session = await ouvrirSessionLecture({ connectionString, copieDeclaree });
  const { client, base } = session;
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const ro = (await client.query('SHOW transaction_read_only')).rows[0]?.transaction_read_only;
    if (ro !== 'on') throw new RefusLecture('TRANSACTION_ECRIVABLE', 'La transaction n\'est pas en lecture seule : lecture refusée.');
    // Tables et vues (lot OP-PONT, Issue #262 : `project_members` est une vue de compatibilité en lecture).
    const presentes = new Set((await client.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v')`)).rows.map((r) => r.relname));
    const lignes = {};
    for (const [table, { sql }] of Object.entries(REQUETES)) {
      if (!/^\s*SELECT\b/i.test(sql)) throw new RefusLecture('REQUETE_NON_LECTURE', `Requête de ${table} hors SELECT.`);
      if (!presentes.has(table)) continue;
      lignes[table] = (await client.query(sql)).rows;
    }
    await client.query('ROLLBACK');
    return { lignes, base: { nom: base.nom, role: base.role, serveur: base.serveur.split(' ').slice(0, 2).join(' ') }, lecture: 'transaction REPEATABLE READ READ ONLY, session default_transaction_read_only = on, ROLLBACK' };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    await session.fermer().catch(() => undefined);
  }
}
