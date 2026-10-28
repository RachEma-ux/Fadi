/**
 * Découpage administratif en base (D-GD-35) : **tout vient des données**. Les niveaux (rang du plus global au plus fin,
 * noms, fiche de la couche) et les entités (code, nom, niveau, code du parent, type) sont lus de fichiers de données
 * qualifiés (`decoupage/<pays>-niveaux.csv`, `decoupage/<source>-entites.csv`, produits depuis le fichier du HCP par
 * `scripts/geodata/decoupage_hcp.py`), puis enregistrés en base par une commande d'import unique. Aucun pays, niveau,
 * nombre de niveaux ni entité n'est écrit dans le code : la hiérarchie se lit par le lien parent → enfant et sa
 * profondeur varie selon l'endroit. Pur : aucun DOM, aucune base.
 */

export interface NiveauAdministratif {
  readonly pays: string;
  /** Identifiant du niveau dans les données (« commune »…). */
  readonly code: string;
  /** 1 = le plus global ; plus le rang est grand, plus le niveau est fin. */
  readonly rang: number;
  readonly singulier: string;
  readonly pluriel: string;
  /** Clé de la fiche de la couche de ce niveau (contours et indicateurs), s'il y en a une. */
  readonly fiche: string | null;
}

export interface EntiteAdministrative {
  readonly pays: string;
  readonly code: string;
  readonly niveau: string;
  readonly parent: string | null;
  readonly nom: string;
  readonly nomAr: string | null;
  readonly type: string | null;
}

/** Lecture d'un CSV (RFC 4180 : champs entre guillemets, guillemets doublés), première ligne = en-tête. */
export function lireCsv(texte: string): Record<string, string>[] {
  const lignes: string[][] = [];
  let champ = "", ligne: string[] = [], guillemets = false;
  const t = texte.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (guillemets) {
      if (c === '"' && t[i + 1] === '"') { champ += '"'; i++; }
      else if (c === '"') guillemets = false;
      else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === ",") { ligne.push(champ); champ = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      ligne.push(champ); champ = "";
      if (ligne.some((x) => x !== "")) lignes.push(ligne);
      ligne = [];
    } else champ += c;
  }
  ligne.push(champ);
  if (ligne.some((x) => x !== "")) lignes.push(ligne);
  const [entete, ...corps] = lignes;
  if (!entete) return [];
  return corps.map((l) => Object.fromEntries(entete.map((n, i) => [n.trim(), (l[i] ?? "").trim()])));
}

const exiger = (l: Record<string, string>, cles: readonly string[], quoi: string) => {
  const manque = cles.filter((k) => !(k in l));
  if (manque.length) throw new Error(`${quoi} : colonne(s) manquante(s) ${manque.join(", ")}`);
};

export function lireNiveaux(texte: string): NiveauAdministratif[] {
  const lignes = lireCsv(texte);
  return lignes.map((l) => {
    exiger(l, ["pays", "code", "rang", "singulier", "pluriel"], "Table des niveaux");
    const rang = Number(l["rang"]);
    return { pays: l["pays"]!, code: l["code"]!, rang, singulier: l["singulier"]!, pluriel: l["pluriel"]!, fiche: l["fiche"] || null };
  }).sort((a, b) => a.pays.localeCompare(b.pays) || a.rang - b.rang);
}

export function lireEntites(texte: string): EntiteAdministrative[] {
  return lireCsv(texte).map((l) => {
    exiger(l, ["pays", "code", "niveau", "parent", "nom"], "Table des entités");
    return { pays: l["pays"]!, code: l["code"]!, niveau: l["niveau"]!, parent: l["parent"] || null, nom: l["nom"]!, nomAr: l["nom_ar"] || null, type: l["type"] || null };
  });
}

const CODE = /^[A-Za-z0-9:._-]{1,64}$/;
const PAYS = /^[A-Z]{2}$/;

/** Contrôles de cohérence avant tout enregistrement ; liste vide = découpage admis. */
export function validerDecoupage(niveaux: readonly NiveauAdministratif[], entites: readonly EntiteAdministrative[]): string[] {
  const erreurs: string[] = [];
  const parNiveau = new Map<string, NiveauAdministratif>();
  const rangs = new Set<string>();
  for (const n of niveaux) {
    if (!PAYS.test(n.pays)) erreurs.push(`niveau ${n.code} : pays « ${n.pays} » invalide`);
    if (!CODE.test(n.code)) erreurs.push(`niveau « ${n.code} » : code invalide`);
    if (!Number.isInteger(n.rang) || n.rang < 1) erreurs.push(`niveau ${n.code} : rang entier ≥ 1 attendu`);
    if (!n.singulier.trim() || !n.pluriel.trim()) erreurs.push(`niveau ${n.code} : noms attendus`);
    const k = `${n.pays}:${n.code}`, r = `${n.pays}:${n.rang}`;
    if (parNiveau.has(k)) erreurs.push(`niveau ${n.code} en double`);
    if (rangs.has(r)) erreurs.push(`rang ${n.rang} en double (${n.pays})`);
    parNiveau.set(k, n); rangs.add(r);
  }
  const parCode = new Map<string, EntiteAdministrative>();
  for (const e of entites) {
    const k = `${e.pays}:${e.code}`;
    if (!CODE.test(e.code)) erreurs.push(`entité « ${e.code} » : code invalide`);
    if (parCode.has(k)) erreurs.push(`entité ${e.code} en double`);
    if (!parNiveau.has(`${e.pays}:${e.niveau}`)) erreurs.push(`entité ${e.code} : niveau « ${e.niveau} » absent de la table des niveaux`);
    if (!e.nom.trim()) erreurs.push(`entité ${e.code} : nom vide`);
    parCode.set(k, e);
  }
  for (const e of entites) {
    if (!e.parent) continue;
    const p = parCode.get(`${e.pays}:${e.parent}`);
    if (!p) { erreurs.push(`entité ${e.code} : parent ${e.parent} absent`); continue; }
    const rp = parNiveau.get(`${p.pays}:${p.niveau}`)?.rang, re = parNiveau.get(`${e.pays}:${e.niveau}`)?.rang;
    if (rp !== undefined && re !== undefined && rp >= re) erreurs.push(`entité ${e.code} : parent ${p.code} d'un niveau qui n'est pas plus global`);
  }
  return erreurs;
}

/** Entités sans parent hors du niveau le plus global de leur pays (signalées, jamais rattachées d'office). */
export function sansParent(niveaux: readonly NiveauAdministratif[], entites: readonly EntiteAdministrative[]): string[] {
  const premier = new Map<string, number>();
  for (const n of niveaux) premier.set(n.pays, Math.min(premier.get(n.pays) ?? Infinity, n.rang));
  const rang = new Map(niveaux.map((n) => [`${n.pays}:${n.code}`, n.rang]));
  return entites.filter((e) => !e.parent && rang.get(`${e.pays}:${e.niveau}`) !== premier.get(e.pays)).map((e) => e.code).sort();
}

export interface BilanDecoupage { readonly ajoutees: string[]; readonly modifiees: string[]; readonly retirees: string[]; readonly sansParent: string[] }

/** Différences entre l'état en base et le nouveau fichier, par code (aucun doublon : une entité = un code par pays). */
export function bilanDecoupage(avant: readonly EntiteAdministrative[], apres: readonly EntiteAdministrative[], niveaux: readonly NiveauAdministratif[]): BilanDecoupage {
  const cle = (e: EntiteAdministrative) => `${e.pays}:${e.code}`;
  const a = new Map(avant.map((e) => [cle(e), e]));
  const b = new Map(apres.map((e) => [cle(e), e]));
  const egal = (x: EntiteAdministrative, y: EntiteAdministrative) => x.niveau === y.niveau && x.parent === y.parent && x.nom === y.nom && x.nomAr === y.nomAr && x.type === y.type;
  return {
    ajoutees: [...b.keys()].filter((k) => !a.has(k)).map((k) => b.get(k)!.code).sort(),
    modifiees: [...b.keys()].filter((k) => a.has(k) && !egal(a.get(k)!, b.get(k)!)).map((k) => b.get(k)!.code).sort(),
    retirees: [...a.keys()].filter((k) => !b.has(k)).map((k) => a.get(k)!.code).sort(),
    sansParent: sansParent(niveaux, apres),
  };
}

/** Liens parent d'un découpage : code → code du parent (null au niveau le plus global). */
export type Parents = ReadonlyMap<string, string | null>;

/** Ancêtres d'un code, du parent direct au plus global ; une boucle éventuelle est coupée. */
export function ancetresDe(code: string, parents: Parents): string[] {
  const out: string[] = [];
  let p = parents.get(code) ?? null;
  while (p !== null && !out.includes(p) && p !== code) { out.push(p); p = parents.get(p) ?? null; }
  return out;
}

/** `code` est-il un descendant (à toute profondeur) de `ancetre` ? */
export const descendDe = (code: string, ancetre: string, parents: Parents): boolean => ancetresDe(code, parents).includes(ancetre);
