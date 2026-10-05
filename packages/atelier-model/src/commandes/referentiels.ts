/**
 * Référentiels de classification chargés explicitement (D-065, fiche DA-06-08) : définitions
 * `referentiel-classification` { systeme, edition, source, codes } — codes et libellés fournis par l'utilisateur
 * (fichier CSV « code ; libellé »), jamais livrés par Fadi. Un seul référentiel par système : le recharger le
 * remplace (version suivante). Quand un référentiel du système existe, `classification.affecter` refuse un code qui
 * n'y figure pas (codes proches proposés) et note le libellé ; sans référentiel, le code reste un texte non vide.
 */
import type { Definition, ModeleAtelier } from "../modele.js";
import { effetsVides, ErreurCommande, lire, type ContexteCommande, type Reducteur } from "./base.js";

type Brut = Record<string, unknown>;

export const CLASSE_REFERENTIEL = "referentiel-classification" as Definition["classe"];
export const MAX_CODES = 50_000;

export interface ParamsReferentiel {
  systeme: string;
  edition: string | null;
  source: string;
  /** Code → libellé (libellé vide : non fourni). */
  codes: Record<string, string>;
}

export function lireParamsReferentiel(p: Brut): ParamsReferentiel {
  const systeme = lire.chaine(p, "systeme").trim();
  if (!systeme || systeme.length > 80) throw new ErreurCommande("invalide", "systeme", "système de classification requis (80 caractères au plus)");
  const edition = lire.chaineOuNull(p, "edition")?.trim() || null;
  const source = lire.chaine(p, "source").trim();
  if (!source || source.length > 200) throw new ErreurCommande("invalide", "source", "source du référentiel requise (fichier, éditeur ; 200 caractères au plus)");
  const brut = p["codes"];
  const codes: Record<string, string> = {};
  const ajouter = (code: unknown, libelle: unknown, chemin: string) => {
    if (typeof code !== "string" || !code.trim() || code.trim().length > 60) throw new ErreurCommande("invalide", chemin, "code non vide de 60 caractères au plus attendu");
    if (libelle !== undefined && libelle !== null && (typeof libelle !== "string" || libelle.length > 300)) throw new ErreurCommande("invalide", chemin, "libellé : texte de 300 caractères au plus");
    const c = code.trim();
    if (c in codes) throw new ErreurCommande("invalide", chemin, `code en double : ${c}`);
    codes[c] = typeof libelle === "string" ? libelle.trim() : "";
  };
  if (Array.isArray(brut)) brut.forEach((x, i) => ajouter((x as Brut | null)?.["code"], (x as Brut | null)?.["libelle"], `codes[${i}]`));
  else if (brut && typeof brut === "object") for (const [c, l] of Object.entries(brut as Brut)) ajouter(c, l, `codes.${c}`);
  else throw new ErreurCommande("invalide", "codes", "« codes » : liste { code, libelle } ou table code → libellé");
  const n = Object.keys(codes).length;
  if (!n || n > MAX_CODES) throw new ErreurCommande("invalide", "codes", `de 1 à ${MAX_CODES} codes`);
  return { systeme, edition, source, codes };
}

export const referentielDu = (etat: ModeleAtelier, systeme: string): (Definition & { params: ParamsReferentiel }) | null =>
  (Object.values(etat.definitions).find((d) => d.classe === CLASSE_REFERENTIEL && (d.params as unknown as ParamsReferentiel).systeme === systeme) as (Definition & { params: ParamsReferentiel }) | undefined) ?? null;

/** Codes proches (même début, puis contenant le texte), pour un refus explicite. */
export function codesProches(r: ParamsReferentiel, code: string, n = 5): string[] {
  const c = code.toLowerCase();
  // Ordre lexical (les clés numériques d'un objet JS ne gardent pas l'ordre de chargement).
  const tous = Object.keys(r.codes).sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
  const debut = tous.filter((x) => x.toLowerCase().startsWith(c.slice(0, Math.max(1, c.length - 1))));
  const dedans = tous.filter((x) => !debut.includes(x) && x.toLowerCase().includes(c));
  return [...debut, ...dedans].slice(0, n);
}

export const reducteursReferentiel: Record<string, Reducteur> = {
  "referentiel.charger": (etat, p, ctx: ContexteCommande) => {
    const params = lireParamsReferentiel(p);
    const existant = referentielDu(etat, params.systeme);
    const id = existant?.id ?? lire.chaineOuNull(p, "id") ?? ctx.ids.nouveau("referentiel");
    if (!existant && etat.definitions[id]) throw new ErreurCommande("precondition", "id", `définition déjà existante : ${id}`);
    const effets = effetsVides();
    (existant ? effets.modifies : effets.crees).push(id);
    const def: Definition = { id, classe: CLASSE_REFERENTIEL, nom: `${params.systeme}${params.edition ? ` (${params.edition})` : ""}`, params: params as unknown as Brut, version: existant ? existant.version + 1 : 1 };
    return { etat: { ...etat, definitions: { ...etat.definitions, [id]: def } }, effets };
  },
  "referentiel.retirer": (etat, p) => {
    const id = lire.chaine(p, "id");
    if (etat.definitions[id]?.classe !== CLASSE_REFERENTIEL) throw new ErreurCommande("precondition", "id", `référentiel inconnu : ${id}`);
    const definitions = { ...etat.definitions };
    delete definitions[id];
    const effets = effetsVides();
    effets.supprimes.push(id);
    return { etat: { ...etat, definitions }, effets };
  },
};

/**
 * Lecture d'un référentiel en CSV (D-065) : une ligne par code, « code ; libellé » (séparateur « ; », sinon « , » ou
 * tabulation, détecté sur la première ligne ; guillemets doubles admis) ; une première ligne d'en-tête « code … » est
 * ignorée. Aucun code n'est ajouté ni corrigé : une ligne sans code est refusée nominativement.
 */
export function lireReferentielCsv(texte: string): { codes: { code: string; libelle: string }[]; refus: { ligne: number; motif: string }[] } {
  const lignes = texte.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  const premiere = lignes.find((l) => l.trim()) ?? "";
  const sep = premiere.includes(";") ? ";" : premiere.includes("\t") ? "\t" : ",";
  const cellules = (l: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let guil = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i]!;
      if (guil) {
        if (ch === '"' && l[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') guil = false;
        else cur += ch;
      } else if (ch === '"') guil = true;
      else if (ch === sep) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  };
  const codes: { code: string; libelle: string }[] = [];
  const refus: { ligne: number; motif: string }[] = [];
  let entete = true;
  lignes.forEach((l, k) => {
    if (!l.trim()) return;
    const [code = "", ...reste] = cellules(l);
    if (entete) {
      entete = false;
      if (/^code$/i.test(code.normalize("NFD").replace(/[̀-ͯ]/g, ""))) return;
    }
    if (!code) return void refus.push({ ligne: k + 1, motif: "code vide" });
    codes.push({ code, libelle: reste.join(sep === "\t" ? " " : `${sep} `).trim() });
  });
  return { codes, refus };
}
