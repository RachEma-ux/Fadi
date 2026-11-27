/**
 * Cas 2 du catalogue, lot 7 : versions, jalons et brouillon (27 novembre 2026). Logique pure, sans React ni stockage.
 *
 * - n° 38 : jalon nommé et figé, avec l'empreinte SHA-256 de son contenu canonique ;
 * - n° 40 : statut et indice de révision portés par la Planche (`reglages.revision`), recopiés dans chaque jalon ;
 * - n° 62 : registre des émissions et des partages (date, pièce, format, destinataire déclaré) ;
 * - n° 33, 41 : comparaison de deux états objet par objet (ajoutés, supprimés, modifiés, avec ce qui a changé) ;
 * - n° 48 : segments en coordonnées du monde des objets à surligner ;
 * - n° 76 : origine d'une variante (Planche et jalon) ;
 * - n° 109 : fiche d'identité du projet (`reglages.ficheProjet`), saisie une fois ; un champ vide reste « non renseigné ».
 *
 * Aucune valeur n'est inventée : statut, indice, champs de la fiche et destinataires sont saisis ; les statuts proposés
 * viennent du gabarit de l'agence ou des jalons déjà posés.
 */
import { REGLAGES_DEFAUT } from "./annotations.js";
import { sha256Hex } from "./empreinte.js";
import { type Contexte, type Definition, type Id, type Matrice4, type Modele, type Resultat, appliquer, composer, matriceMonde, modifierAnnotations } from "./geometrie-libre.js";
import type { Vec3 } from "./vecteur.js";

// ---------------------------------------------------------------------------------------------------------------
// Statut, indice et fiche du projet

export interface Revision {
  /** Statut saisi (« Esquisse », « Permis »…) ; vide = non renseigné. */
  readonly statut: string;
  /** Indice de révision saisi (« A », « B », « 02 »…) ; vide = non renseigné. */
  readonly indice: string;
}

export const CHAMPS_FICHE = ["projet", "numero", "maitreOuvrage", "adresse", "parcelle", "auteur"] as const;
export type ChampFiche = (typeof CHAMPS_FICHE)[number];
export type FicheProjet = Readonly<Partial<Record<ChampFiche, string>>>;

const LONGUEUR_MAX_CHAMP = 200;
const propre = (v: string): string => v.replace(/\s+/g, " ").trim().slice(0, LONGUEUR_MAX_CHAMP);

export const revisionDe = (m: Modele): Revision | null => m.annotations?.reglages?.revision ?? null;
export const ficheDe = (m: Modele): FicheProjet => m.annotations?.reglages?.ficheProjet ?? {};
/** Valeur d'un champ de la fiche, ou `null` (« non renseigné ») : jamais complétée à la place de l'utilisateur. */
export const valeurFiche = (f: FicheProjet, champ: ChampFiche): string | null => (f[champ] ? f[champ] : null);

/** Pose le statut et l'indice (textes nettoyés) ; deux champs vides retirent la révision. */
export function poserRevision(m: Modele, r: Revision): Resultat {
  const statut = propre(r.statut).slice(0, 60);
  const indice = propre(r.indice).slice(0, 12);
  return modifierAnnotations(m, (a) => {
    const { revision: _r, ...reste } = a.reglages ?? REGLAGES_DEFAUT;
    a.reglages = statut || indice ? { ...reste, revision: { statut, indice } } : reste;
  });
}

/** Pose la fiche du projet ; un champ vide est retiré (il redevient « non renseigné »). */
export function poserFiche(m: Modele, f: FicheProjet): Resultat {
  const fiche: Partial<Record<ChampFiche, string>> = {};
  for (const c of CHAMPS_FICHE) {
    const v = propre(f[c] ?? "");
    if (v) fiche[c] = v;
  }
  return modifierAnnotations(m, (a) => {
    const { ficheProjet: _f, ...reste } = a.reglages ?? REGLAGES_DEFAUT;
    a.reglages = Object.keys(fiche).length ? { ...reste, ficheProjet: fiche } : reste;
  });
}

/** Libellés des champs dans les pièces émises (documents produits : en français, comme les données du projet). */
export const LIBELLES_FICHE: Readonly<Record<ChampFiche, string>> = {
  projet: "Projet",
  numero: "N° de projet",
  maitreOuvrage: "Maître d'ouvrage",
  adresse: "Adresse",
  parcelle: "Parcelle",
  auteur: "Auteur du projet",
};

/** Texte de la révision pour une pièce émise (« Permis, indice B ») ; `null` si non renseignée. */
export function texteRevision(r: Revision | null): string | null {
  if (!r) return null;
  const t = [r.statut, r.indice ? `indice ${r.indice}` : ""].filter(Boolean).join(", ");
  return t || null;
}

/** Lignes de la fiche pour une pièce émise (rapport, cartouche) : chaque champ, ou « non renseigné ». */
export function lignesFiche(f: FicheProjet, libelles: Readonly<Record<ChampFiche, string>> = LIBELLES_FICHE, nonRenseigne = "non renseigné"): readonly (readonly [string, string])[] {
  return CHAMPS_FICHE.map((c) => [libelles[c], valeurFiche(f, c) ?? nonRenseigne] as const);
}

// ---------------------------------------------------------------------------------------------------------------
// Jalons et registre

export const FORMAT_VERSIONS = "fadi-planche-versions/1";

/** Origine d'une variante (n° 76) : la Planche d'où elle vient et, s'il y en a un, le jalon. */
export interface OrigineVariante {
  readonly planche: string;
  readonly nomPlanche: string;
  readonly jalon?: string;
  readonly nomJalon?: string;
}

export interface Jalon {
  readonly id: string;
  readonly nom: string;
  /** Date ISO de la pose. */
  readonly date: string;
  readonly statut: string;
  readonly indice: string;
  /** SHA-256 (hexadécimal) du contenu canonique figé. */
  readonly empreinte: string;
  /** Nombre d'objets au moment de la pose (affichage). */
  readonly objets: number;
}

export interface Emission {
  readonly id: string;
  readonly date: string;
  /** Pièce émise : jalon courant (nom) ou `null` (état courant). */
  readonly jalon: string | null;
  readonly indice: string;
  /** Format écrit (IFC, OBJ, PNG, .planche…). */
  readonly format: string;
  readonly fichier: string;
  /** « emission » (fichier téléchargé) ou « partage » (lien donné). */
  readonly genre: "emission" | "partage";
  /** Destinataire déclaré par l'utilisateur ; `null` = non renseigné. */
  readonly destinataire: string | null;
}

export interface RegistreVersions {
  readonly jalons: readonly Jalon[];
  readonly emissions: readonly Emission[];
}

export const registreVide = (): RegistreVersions => ({ jalons: [], emissions: [] });

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texte = (v: unknown): v is string => typeof v === "string";

/** Registre d'un texte sérialisé ; `null` s'il est absent ou mal formé (jamais une erreur bloquante). */
export function lireRegistreVersions(t: string | null): RegistreVersions | null {
  if (!t) return null;
  try {
    const j: unknown = JSON.parse(t);
    if (!estObjet(j) || j["format"] !== FORMAT_VERSIONS || !Array.isArray(j["jalons"]) || !Array.isArray(j["emissions"])) return null;
    const jalons: Jalon[] = [];
    for (const x of j["jalons"]) {
      if (!estObjet(x) || !texte(x["id"]) || !texte(x["nom"]) || !texte(x["date"]) || !texte(x["statut"]) || !texte(x["indice"]) || !texte(x["empreinte"]) || typeof x["objets"] !== "number") return null;
      jalons.push({ id: x["id"], nom: x["nom"], date: x["date"], statut: x["statut"], indice: x["indice"], empreinte: x["empreinte"], objets: x["objets"] });
    }
    const emissions: Emission[] = [];
    for (const x of j["emissions"]) {
      if (!estObjet(x) || !texte(x["id"]) || !texte(x["date"]) || !texte(x["format"]) || !texte(x["fichier"]) || !texte(x["indice"])) return null;
      if (x["jalon"] !== null && !texte(x["jalon"])) return null;
      if (x["destinataire"] !== null && !texte(x["destinataire"])) return null;
      if (x["genre"] !== "emission" && x["genre"] !== "partage") return null;
      emissions.push({ id: x["id"], date: x["date"], jalon: x["jalon"], indice: x["indice"], format: x["format"], fichier: x["fichier"], genre: x["genre"], destinataire: x["destinataire"] });
    }
    return { jalons, emissions };
  } catch {
    return null;
  }
}

export const serialiserRegistreVersions = (r: RegistreVersions): string => JSON.stringify({ format: FORMAT_VERSIONS, jalons: r.jalons, emissions: r.emissions });

/** Texte JSON canonique (clés triées) : deux modèles égaux donnent le même texte, donc la même empreinte. */
export function texteCanonique(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : texteCanonique(x))).join(",")}]`;
  if (estObjet(v))
    return `{${Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${texteCanonique(v[k])}`)
      .join(",")}}`;
  return JSON.stringify(v) ?? "null";
}

export const empreinteModele = (m: Modele): string => sha256Hex(texteCanonique(m));

/** Contenu figé d'un jalon : le modèle canonique (texte), relu tel quel. */
export const contenuJalon = (m: Modele): string => texteCanonique(m);

/** Modèle d'un contenu de jalon, contrôlé par l'empreinte : `null` si le contenu a changé ou est illisible. */
export function lireContenuJalon(j: Jalon, contenu: string | null): Modele | null {
  if (!contenu || sha256Hex(contenu) !== j.empreinte) return null;
  try {
    const m = JSON.parse(contenu) as Modele;
    return estObjet(m) && estObjet(m.racine) && estObjet(m.definitions) ? m : null;
  } catch {
    return null;
  }
}

const NOM_JALON_MAX = 80;

/** Nouveau jalon (n° 38, n° 40) : nom propre exigé ; statut et indice recopiés de la Planche. */
export function poserJalon(r: RegistreVersions, m: Modele, o: { readonly nom: string; readonly date: string; readonly id: string }): { readonly registre: RegistreVersions; readonly jalon: Jalon; readonly contenu: string } {
  const nom = propre(o.nom).slice(0, NOM_JALON_MAX);
  if (!nom) throw new RangeError("Un jalon demande un nom.");
  if (r.jalons.some((j) => j.id === o.id)) throw new RangeError("Identifiant de jalon déjà pris.");
  const contenu = contenuJalon(m);
  const rev = revisionDe(m);
  const jalon: Jalon = { id: o.id, nom, date: o.date, statut: rev?.statut ?? "", indice: rev?.indice ?? "", empreinte: sha256Hex(contenu), objets: objetsDe(m).size };
  return { registre: { ...r, jalons: [jalon, ...r.jalons] }, jalon, contenu };
}

/** Note une émission ou un partage (n° 62), en tête du registre. */
export function noterEmission(r: RegistreVersions, e: Omit<Emission, "destinataire"> & { readonly destinataire?: string | null }): RegistreVersions {
  const d = e.destinataire ? propre(e.destinataire) : "";
  return { ...r, emissions: [{ ...e, destinataire: d || null }, ...r.emissions] };
}

/** Destinataire déclaré d'une émission ; vide = non renseigné. */
export function declarerDestinataire(r: RegistreVersions, id: string, destinataire: string): RegistreVersions {
  const d = propre(destinataire);
  return { ...r, emissions: r.emissions.map((e) => (e.id === id ? { ...e, destinataire: d || null } : e)) };
}

/** Statuts proposés : ceux du gabarit de l'agence, puis ceux des jalons déjà posés, sans doublon. */
export function statutsProposes(gabarit: readonly string[] | undefined, r: RegistreVersions): readonly string[] {
  return [...new Set([...(gabarit ?? []), ...r.jalons.map((j) => j.statut).filter(Boolean)])];
}

// ---------------------------------------------------------------------------------------------------------------
// Comparaison objet par objet (n° 33, 41) et surlignage (n° 48)

export type AspectDifference = "geometrie" | "matiere" | "balise" | "nom" | "donnees" | "etat";
export type EtatDifference = "ajoute" | "supprime" | "modifie";

export interface ObjetCompare {
  readonly id: Id;
  readonly nom: string;
  /** Genre de l'objet : groupe ou composant (occurrence), cote, texte, plan de coupe. */
  readonly genre: "groupe" | "composant" | "cote" | "texte" | "plan-de-coupe";
  readonly etat: EtatDifference;
  /** Ce qui a changé (« modifie » seulement). */
  readonly aspects: readonly AspectDifference[];
}

export interface Comparaison {
  readonly ajoutes: readonly ObjetCompare[];
  readonly supprimes: readonly ObjetCompare[];
  readonly modifies: readonly ObjetCompare[];
  /** Géométrie libre de la racine (hors objets) : arêtes et faces ajoutées, supprimées, modifiées. */
  readonly geometrieLibre: { readonly ajoutees: number; readonly supprimees: number; readonly modifiees: number };
}

interface Fiche {
  readonly nom: string;
  readonly genre: ObjetCompare["genre"];
  /** Empreintes par aspect. */
  readonly aspects: Readonly<Record<AspectDifference, string>>;
}

/** Contenu d'une définition, objets imbriqués compris (leur définition est développée), en texte canonique. */
function contenuDeveloppe(m: Modele, c: Contexte, profondeur = 0): unknown {
  if (profondeur > 32) return null;
  return {
    sommets: c.sommets,
    aretes: c.aretes,
    faces: c.faces,
    courbes: c.courbes,
    occurrences: Object.fromEntries(
      Object.entries(c.occurrences).map(([id, o]) => {
        const d = m.definitions[o.definition];
        return [id, { t: o.transformation, materiau: o.materiau ?? null, balise: o.balise ?? null, contenu: d ? contenuDeveloppe(m, d.contenu, profondeur + 1) : null }];
      }),
    ),
  };
}

/** Objets comparables d'un modèle : occurrences de la racine, cotes, textes et plans de coupe, par identifiant. */
function objetsDe(m: Modele): Map<Id, Fiche> {
  const r = new Map<Id, Fiche>();
  for (const [id, o] of Object.entries(m.racine.occurrences)) {
    const d = m.definitions[o.definition];
    const { transformation, materiau, balise, nom, donnees, definition: _d, id: _i, ...etat } = o;
    // Métadonnées de la définition (nom, description, données…) : un composant renommé ou décrit autrement est « modifié ».
    const { contenu: _c, id: _di, nom: nomDefinition, genre: _g, ...meta } = d ?? ({} as Partial<Definition>);
    r.set(id, {
      nom: nom || d?.nom || id,
      genre: d?.genre ?? "groupe",
      aspects: {
        geometrie: texteCanonique({ t: transformation, contenu: d ? contenuDeveloppe(m, d.contenu) : null }),
        matiere: texteCanonique(materiau ?? null),
        balise: texteCanonique(balise ?? null),
        nom: texteCanonique({ o: nom ?? null, d: nomDefinition ?? null }),
        donnees: texteCanonique({ o: donnees ?? null, d: meta }),
        etat: texteCanonique(etat),
      },
    });
  }
  const a = m.annotations;
  const ajouter = (genre: ObjetCompare["genre"], table: Readonly<Record<Id, { readonly balise?: string; readonly nom?: string; readonly texte?: string }>> | undefined, defaut: string) => {
    for (const [id, x] of Object.entries(table ?? {})) {
      const { balise, nom, ...reste } = x as Record<string, unknown> & { balise?: string; nom?: string };
      r.set(id, {
        nom: nom || (typeof x.texte === "string" && x.texte ? x.texte.slice(0, 40) : `${defaut} ${id}`),
        genre,
        aspects: { geometrie: texteCanonique(reste), matiere: "null", balise: texteCanonique(balise ?? null), nom: texteCanonique(nom ?? null), donnees: "null", etat: "null" },
      });
    }
  };
  ajouter("cote", a?.cotes, "Cote");
  ajouter("texte", a?.textes, "Texte");
  ajouter("plan-de-coupe", a?.plansDeCoupe, "Plan de coupe");
  return r;
}

const ASPECTS: readonly AspectDifference[] = ["geometrie", "matiere", "balise", "nom", "donnees", "etat"];
const parNom = (a: ObjetCompare, b: ObjetCompare) => a.nom.localeCompare(b.nom, "fr") || a.id.localeCompare(b.id);

/** Compare deux états (`depuis` → `vers`) objet par objet ; rien n'est corrigé ni fusionné. */
export function comparerModeles(depuis: Modele, vers: Modele): Comparaison {
  const a = objetsDe(depuis);
  const b = objetsDe(vers);
  const ajoutes: ObjetCompare[] = [];
  const supprimes: ObjetCompare[] = [];
  const modifies: ObjetCompare[] = [];
  for (const [id, f] of b) {
    const g = a.get(id);
    if (!g) ajoutes.push({ id, nom: f.nom, genre: f.genre, etat: "ajoute", aspects: [] });
    else {
      const aspects = ASPECTS.filter((x) => g.aspects[x] !== f.aspects[x]);
      if (aspects.length) modifies.push({ id, nom: f.nom, genre: f.genre, etat: "modifie", aspects });
    }
  }
  for (const [id, g] of a) if (!b.has(id)) supprimes.push({ id, nom: g.nom, genre: g.genre, etat: "supprime", aspects: [] });
  // Géométrie libre de la racine : arêtes et faces par identifiant.
  let ajoutees = 0;
  let supprimees = 0;
  let modifiees = 0;
  const libre = (x: Modele) => ({ ...x.racine.aretes, ...x.racine.faces }) as Readonly<Record<Id, unknown>>;
  const la = libre(depuis);
  const lb = libre(vers);
  // Une arête est comparée avec la position de ses deux sommets ; une face, par sa propre description.
  const sommetsDe = (x: Modele, e: unknown): unknown =>
    estObjet(e) && typeof e["a"] === "string" && typeof e["b"] === "string" ? [x.racine.sommets[e["a"]]?.position ?? null, x.racine.sommets[e["b"]]?.position ?? null] : null;
  for (const [id, e] of Object.entries(lb)) {
    if (!(id in la)) ajoutees++;
    else if (texteCanonique({ e, s: sommetsDe(vers, e) }) !== texteCanonique({ e: la[id], s: sommetsDe(depuis, la[id]) })) modifiees++;
  }
  for (const id of Object.keys(la)) if (!(id in lb)) supprimees++;
  return { ajoutes: ajoutes.sort(parNom), supprimes: supprimes.sort(parNom), modifies: modifies.sort(parNom), geometrieLibre: { ajoutees, supprimees, modifiees } };
}

export const comparaisonVide = (c: Comparaison): boolean =>
  !c.ajoutes.length && !c.supprimes.length && !c.modifies.length && !c.geometrieLibre.ajoutees && !c.geometrieLibre.supprimees && !c.geometrieLibre.modifiees;

export type Segment = readonly [Vec3, Vec3];

function segmentsContexte(m: Modele, c: Contexte, M: Matrice4, sortie: Segment[], profondeur: number): void {
  if (profondeur > 32) return;
  for (const e of Object.values(c.aretes)) {
    const a = c.sommets[e.a];
    const b = c.sommets[e.b];
    if (a && b) sortie.push([appliquer(M, a.position), appliquer(M, b.position)]);
  }
  for (const o of Object.values(c.occurrences)) {
    const d = m.definitions[o.definition];
    if (d) segmentsContexte(m, d.contenu, composer(M, o.transformation), sortie, profondeur + 1);
  }
}

/** Arêtes d'un objet de la racine en coordonnées du monde (n° 48) ; cotes et textes : aucun segment. */
export function segmentsObjet(m: Modele, id: Id): Segment[] {
  const o = m.racine.occurrences[id];
  if (!o) return [];
  const d = m.definitions[o.definition];
  const M = matriceMonde(m, id);
  if (!d || !M) return [];
  const r: Segment[] = [];
  segmentsContexte(m, d.contenu, M, r, 0);
  return r;
}

/** Segments à surligner : ajoutés et modifiés dans l'état d'arrivée, supprimés dans l'état de départ. */
export function segmentsDifferences(depuis: Modele, vers: Modele, c: Comparaison): { readonly ajoutes: Segment[]; readonly modifies: Segment[]; readonly supprimes: Segment[] } {
  return {
    ajoutes: c.ajoutes.flatMap((o) => segmentsObjet(vers, o.id)),
    modifies: c.modifies.flatMap((o) => segmentsObjet(vers, o.id)),
    supprimes: c.supprimes.flatMap((o) => segmentsObjet(depuis, o.id)),
  };
}
