import { describe, expect, it } from "vitest";
/**
 * EX-001 (autonomie native, réutilisation des services généraux) — contrôle statique du schéma drizzle réel : le
 * Studio ne crée ni deuxième gestion d'utilisateurs, ni deuxième annuaire. Chaque personne citée par une table
 * `studio_*` est une clé étrangère vers `users` (les comptes Fadi) ; aucune table Studio ne porte d'identifiant de
 * connexion (courriel, mot de passe, jeton, session) ni de rôle propre ; l'appartenance et les rôles restent ceux de
 * `project_members`. Le pendant exécuté (même compte de session, même catalogue des Documents) est dans
 * `apps/web/e2e/studio-persistance.mjs` (contrôles « EX-001 : … »). Pur : aucune base, aucun réseau.
 */
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../db/schema.js";

type Table = Parameters<typeof getTableConfig>[0];
const config = (t: unknown) => getTableConfig(t as Table);
const tables = Object.values(schema).filter((v) => {
  try { return !!v && typeof v === "object" && !!config(v).name; } catch { return false; }
});
const studio = tables.filter((t) => config(t).name.startsWith("studio_"));
/** Colonnes qui désignent une personne (auteur, acteur, responsable, délégant, délégué, décideur…). */
const PERSONNE = /^(author_id|actor_id|user_id|created_by|decided_by|updated_by|responsable_id|assignee_id|delegate_id|delegator_id|approved_by|reviewed_by|.*_by)$/;
const CONNEXION = /(^|_)(email|password|password_hash|token|session|login|mot_de_passe|courriel)(_|$)/;

describe("EX-001 — le Studio réutilise les comptes Fadi (aucune seconde gestion d'utilisateurs)", () => {
  it("le schéma compte des tables Studio et la table des comptes Fadi `users`", () => {
    expect(studio.length).toBeGreaterThan(10);
    expect(config(schema.users).name).toBe("users");
  });
  it("EX-001 [+] chaque colonne Studio qui désigne une personne est une clé étrangère vers users.id", () => {
    const sansCompte: string[] = [];
    let personnes = 0;
    for (const t of studio) {
      const cfg = config(t);
      for (const col of cfg.columns.filter((c) => PERSONNE.test(c.name))) {
        personnes++;
        const fk = cfg.foreignKeys.find((f) => f.reference().columns.some((c) => c.name === col.name));
        const cible = fk ? config(fk.reference().foreignTable).name : null;
        const colonneCible = fk?.reference().foreignColumns[0]?.name;
        if (cible !== "users" || colonneCible !== "id") sansCompte.push(`${cfg.name}.${col.name} → ${cible ?? "aucune clé"}`);
      }
    }
    expect(personnes).toBeGreaterThan(10);
    expect(sansCompte).toEqual([]);
  });
  it("EX-001 [−] aucune table Studio de comptes, de sessions, de membres ou de rôles ; aucune colonne d'identifiant de connexion", () => {
    expect(studio.map((t) => config(t).name).filter((n) => /(user|account|compte|session|member|membre|role|login)/.test(n))).toEqual([]);
    expect(studio.flatMap((t) => config(t).columns.filter((c) => CONNEXION.test(c.name)).map((c) => `${config(t).name}.${c.name}`))).toEqual([]);
  });
});
