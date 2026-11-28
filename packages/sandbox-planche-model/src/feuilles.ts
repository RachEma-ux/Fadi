/**
 * Feuilles de dessin de la Planche (cas 4 du catalogue des extensions, étape 6 : D7-F11-013, D7-F11-012, D7-F11-011). Pur :
 * ni React, ni DOM.
 *
 * - Feuille (`annotations.feuilles`, préfixe « k ») : format A0 à A4 calculé selon ISO 216 (A0 d'un mètre carré au
 *   rapport √2, chaque format moitié du précédent, arrondi au millimètre inférieur), sens, cadre ISO 5457 (20 mm de
 *   reliure à gauche, 10 mm ailleurs), cartouche saisi (un champ vide reste vide), fenêtres de vue.
 * - Fenêtre de vue : plan vectoriel d'une scène (ou de la vue de dessus) à une échelle de la série, posé au millimètre.
 * - Composition en primitives (mm, y vers le bas), rendue en SVG (aperçu) et en PDF vectoriel multipage à l'échelle
 *   exacte : 1 mm de la feuille = 1 mm du PDF ; relecture du fichier émis pour contrôler ses formats.
 */
import type { FamilleHachure, Feuille, FenetreVue, MotifHachure, PlanDeCoupe, Scene } from "./annotations.js";
import { type Id, type Modele, type StatutTravaux, modifierAnnotations } from "./geometrie-libre.js";
import { dessinerCote } from "./cotes.js";
import { type ClasseTrait, type P2, type PlanProjete, type VueProjection, planDeCoupeActif, projeterPlan, repereVue } from "./plan-vectoriel.js";
import { dot } from "./vecteur.js";

/** Épaisseurs des traits (mm papier) : convention graphique du dessin, pas une donnée de projet. */
export const EPAISSEURS_TRAITS: Readonly<Record<ClasseTrait, number>> = { coupe: 0.5, vu: 0.18, cache: 0.13 };
/** Série des échelles proposées (dénominateurs). */
export const ECHELLES_SERIE: readonly number[] = [1, 5, 10, 20, 50, 100, 200, 500];
export const FORMATS_A: readonly (0 | 1 | 2 | 3 | 4)[] = [0, 1, 2, 3, 4];
/** Cadre ISO 5457 : bande de reliure à gauche, marge ailleurs (mm). */
export const CADRE = { reliure: 20, marge: 10 } as const;
/** Cartouche : trois rangs de 9 mm sur 180 mm, en bas à droite dans le cadre. */
export const CARTOUCHE = { largeur: 180, rang: 9 } as const;
const NUMERO_MAX = 20;
const NOM_MAX = 80;
const INDICE_MAX = 10;
const CHAMP_MAX = 80;
/** Fenêtres de vue par feuille au plus (même borne que la relecture `estFeuille`). */
export const FENETRES_MAX = 32;
/** Lignes de hachure d'une famille au plus dans une poche du PDF ; au-delà l'export est refusé, jamais tronqué. */
export const LIGNES_HACHURE_MAX = 4000;

/** Dimensions d'un format A (mm) : petit côté × grand côté. */
export function formatA(rang: number): { readonly court: number; readonly long: number } {
  let long = Math.round(1000 * 2 ** 0.25);
  let court = Math.round(1000 * 2 ** -0.25);
  for (let i = 0; i < rang; i++) [long, court] = [court, Math.floor(long / 2)];
  return { court, long };
}
export function dimensionsFeuille(f: Pick<Feuille, "format" | "sens">): { readonly largeur: number; readonly hauteur: number } {
  const d = formatA(f.format);
  return f.sens === "paysage" ? { largeur: d.long, hauteur: d.court } : { largeur: d.court, hauteur: d.long };
}

// ————————————————————————————————————————————————————————————— Validation et édition

export type ErreurFeuille = "numero" | "nom" | "indice" | "cartouche" | "format" | "echelle" | "scene" | "coupe" | "position" | "absent" | "limite";

const texteBorne = (v: unknown, max: number, vide = true): v is string => typeof v === "string" && v.length <= max && (vide || v.trim().length > 0);
const fini = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function estFenetre(v: unknown): v is FenetreVue {
  if (typeof v !== "object" || v === null) return false;
  const w = v as Record<string, unknown>;
  return typeof w["id"] === "string" && /^v[0-9]+$/.test(w["id"]) && (w["scene"] === null || typeof w["scene"] === "string") && fini(w["echelle"]) && (w["echelle"] as number) > 0 && (w["coupe"] === null || typeof w["coupe"] === "string") && fini(w["x"]) && fini(w["y"]);
}

/** Feuille reçue (document, delta) : jamais crue sur parole. */
export function estFeuille(id: Id, v: unknown): v is Feuille {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const w = v as Record<string, unknown>;
  const c = w["cartouche"] as Record<string, unknown> | undefined;
  return (
    w["id"] === id &&
    /^k[0-9a-z]+$/.test(id) &&
    texteBorne(w["numero"], NUMERO_MAX, false) &&
    texteBorne(w["nom"], NOM_MAX) &&
    texteBorne(w["indice"], INDICE_MAX) &&
    FORMATS_A.includes(w["format"] as 0) &&
    (w["sens"] === "paysage" || w["sens"] === "portrait") &&
    typeof c === "object" &&
    c !== null &&
    texteBorne(c["projet"], CHAMP_MAX) &&
    texteBorne(c["phase"], CHAMP_MAX) &&
    texteBorne(c["date"], CHAMP_MAX) &&
    Array.isArray(w["fenetres"]) &&
    w["fenetres"].length <= FENETRES_MAX &&
    w["fenetres"].every(estFenetre) &&
    new Set((w["fenetres"] as FenetreVue[]).map((f) => f.id)).size === w["fenetres"].length
  );
}

export type ResultatFeuille = { readonly ok: true; readonly modele: Modele; readonly id: Id } | { readonly ok: false; readonly erreur: ErreurFeuille };

/** Numéro proposé pour une nouvelle feuille : « 1 », « 2 »… le premier libre (l'utilisateur le renomme). */
export function numeroFeuilleSuivant(m: Modele): string {
  const pris = new Set(Object.values(m.annotations?.feuilles ?? {}).map((f) => f.numero));
  let n = 1;
  while (pris.has(String(n))) n++;
  return String(n);
}

function verifierFeuille(f: Omit<Feuille, "id" | "fenetres">): ErreurFeuille | null {
  if (!texteBorne(f.numero, NUMERO_MAX, false)) return "numero";
  if (!texteBorne(f.nom, NOM_MAX)) return "nom";
  if (!texteBorne(f.indice, INDICE_MAX)) return "indice";
  if (!FORMATS_A.includes(f.format) || (f.sens !== "paysage" && f.sens !== "portrait")) return "format";
  if (![f.cartouche.projet, f.cartouche.phase, f.cartouche.date].every((x) => texteBorne(x, CHAMP_MAX))) return "cartouche";
  return null;
}

/** Crée une feuille A3 paysage sans fenêtre (un pas). */
export function creerFeuille(m: Modele, v: { readonly numero: string; readonly nom: string }): ResultatFeuille {
  const f = { numero: v.numero.trim(), nom: v.nom.trim(), indice: "", format: 3 as const, sens: "paysage" as const, cartouche: { projet: "", phase: "", date: "" } };
  const e = verifierFeuille(f);
  if (e) return { ok: false, erreur: e };
  let id = "" as Id;
  const modele = modifierAnnotations(m, (a, nouvel) => {
    id = nouvel("k");
    a.feuilles[id] = { ...f, id, fenetres: [] };
  }).modele;
  return { ok: true, modele, id };
}

/** Modifie les champs d'une feuille (numéro, nom, indice, format, sens, cartouche) en un pas. */
export function modifierFeuille(m: Modele, id: Id, v: Partial<Omit<Feuille, "id" | "fenetres">>): ResultatFeuille {
  const f = m.annotations?.feuilles?.[id];
  if (!f) return { ok: false, erreur: "absent" };
  const suivante = { ...f, ...v, ...(v.numero !== undefined ? { numero: v.numero.trim() } : {}), cartouche: { ...f.cartouche, ...(v.cartouche ?? {}) } };
  const e = verifierFeuille(suivante);
  if (e) return { ok: false, erreur: e };
  return { ok: true, modele: modifierAnnotations(m, (a) => void (a.feuilles[id] = suivante)).modele, id };
}

export function supprimerFeuille(m: Modele, id: Id): ResultatFeuille {
  if (!m.annotations?.feuilles?.[id]) return { ok: false, erreur: "absent" };
  return { ok: true, modele: modifierAnnotations(m, (a) => void delete a.feuilles[id]).modele, id };
}

function verifierFenetre(m: Modele, f: Omit<FenetreVue, "id">): ErreurFeuille | null {
  if (!ECHELLES_SERIE.includes(f.echelle)) return "echelle";
  if (f.scene !== null && !m.annotations?.scenes?.[f.scene]) return "scene";
  if (f.coupe !== null && f.coupe !== "aucune" && !m.annotations?.plansDeCoupe[f.coupe]) return "coupe";
  if (!fini(f.x) || !fini(f.y) || Math.abs(f.x) > 5000 || Math.abs(f.y) > 5000) return "position";
  return null;
}

/** Ajoute une fenêtre de vue à une feuille (un pas) ; son identifiant est local à la feuille. */
export function ajouterFenetre(m: Modele, feuille: Id, v: Omit<FenetreVue, "id">): ResultatFeuille {
  const f = m.annotations?.feuilles?.[feuille];
  if (!f) return { ok: false, erreur: "absent" };
  if (f.fenetres.length >= FENETRES_MAX) return { ok: false, erreur: "limite" };
  const e = verifierFenetre(m, v);
  if (e) return { ok: false, erreur: e };
  const n = Math.max(0, ...f.fenetres.map((x) => Number(x.id.slice(1)))) + 1;
  const id = `v${n}`;
  return { ok: true, modele: modifierAnnotations(m, (a) => void (a.feuilles[feuille] = { ...f, fenetres: [...f.fenetres, { ...v, id }] })).modele, id };
}

export function modifierFenetre(m: Modele, feuille: Id, fenetre: string, v: Partial<Omit<FenetreVue, "id">>): ResultatFeuille {
  const f = m.annotations?.feuilles?.[feuille];
  const x = f?.fenetres.find((w) => w.id === fenetre);
  if (!f || !x) return { ok: false, erreur: "absent" };
  const suivante = { ...x, ...v };
  const e = verifierFenetre(m, suivante);
  if (e) return { ok: false, erreur: e };
  return { ok: true, modele: modifierAnnotations(m, (a) => void (a.feuilles[feuille] = { ...f, fenetres: f.fenetres.map((w) => (w.id === fenetre ? suivante : w)) })).modele, id: fenetre };
}

export function supprimerFenetre(m: Modele, feuille: Id, fenetre: string): ResultatFeuille {
  const f = m.annotations?.feuilles?.[feuille];
  if (!f || !f.fenetres.some((w) => w.id === fenetre)) return { ok: false, erreur: "absent" };
  return { ok: true, modele: modifierAnnotations(m, (a) => void (a.feuilles[feuille] = { ...f, fenetres: f.fenetres.filter((w) => w.id !== fenetre) })).modele, id: fenetre };
}

/** Nom de fichier d'une feuille selon un motif ({numero}, {nom}, {indice}, {projet}, {phase}) ; caractères sûrs seulement. */
export function nomFichierFeuille(motif: string, f: Feuille, extension: "pdf" | "dxf" = "pdf"): string {
  const valeurs: Record<string, string> = { numero: f.numero, nom: f.nom, indice: f.indice, projet: f.cartouche.projet, phase: f.cartouche.phase };
  const brut = motif.replace(/\{(numero|nom|indice|projet|phase)\}/g, (_t, k: string) => valeurs[k] ?? "");
  const sur = brut.replace(/[^\p{L}\p{N}_.-]+/gu, "_").replace(/_+/g, "_").replace(/^[_.-]+|[_.-]+$/g, "").slice(0, 120);
  return `${sur || "feuille"}.${extension}`;
}

// ————————————————————————————————————————————————————————————— Composition

export type PrimitiveFeuille =
  | { readonly genre: "trait"; readonly a: P2; readonly b: P2; readonly epaisseur: number; readonly tirets?: readonly number[]; readonly classe?: ClasseTrait | "cote"; readonly statut?: StatutTravaux }
  | { readonly genre: "cadre"; readonly x: number; readonly y: number; readonly largeur: number; readonly hauteur: number; readonly epaisseur: number }
  | { readonly genre: "poche"; readonly boucles: readonly (readonly P2[])[]; readonly motif: MotifHachure | null; readonly statut?: StatutTravaux }
  | { readonly genre: "texte"; readonly x: number; readonly y: number; readonly taille: number; readonly texte: string; readonly gras?: boolean; readonly gris?: boolean; readonly ancre?: "debut" | "fin" | "milieu"; readonly cote?: boolean };

export interface FenetreComposee {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly largeur: number;
  readonly hauteur: number;
  readonly echelle: number;
  readonly titre: string;
  /** La fenêtre sort du cadre de la feuille. */
  readonly depasse: boolean;
  readonly vide: boolean;
}
export interface CompositionFeuille {
  readonly largeur: number;
  readonly hauteur: number;
  readonly primitives: readonly PrimitiveFeuille[];
  readonly fenetres: readonly FenetreComposee[];
  readonly echelles: readonly number[];
}
/** Libellés du cartouche et titre de la vue de dessus : fournis par l'interface (bilingue). */
export interface LibellesFeuille {
  readonly projet: string;
  readonly phase: string;
  readonly titre: string;
  readonly date: string;
  readonly numero: string;
  readonly indice: string;
  readonly echelles: string;
  readonly vueDessus: string;
  /** Séparateur décimal des cotes (langue de l'interface) ; « , » par défaut. */
  readonly separateur?: "." | ",";
}

const DESSUS: VueProjection = { direction: { x: 0, y: 0, z: -1 }, haut: { x: 0, y: 1, z: 0 } };
const TIRETS_CACHE = [EPAISSEURS_TRAITS.cache * 8, EPAISSEURS_TRAITS.cache * 6];

/** Cote projetée dans le repère d'une vue (m) : polylignes (attaches, ligne de cote, extrémités) et texte. */
export interface CoteProjetee {
  readonly lignes: readonly (readonly P2[])[];
  readonly etiquette: P2;
  readonly texte: string;
}

/**
 * Projection d'une fenêtre de vue : scène (ou vue de dessus), plan de coupe de la fenêtre et cotes du modèle, en mètres.
 * Une cote est reprise si elle n'est pas retirée par le plan de coupe et ne se réduit pas à un point dans la vue ; ses
 * extrémités mesurent `extremite` mm sur le papier à l'échelle donnée.
 */
export function projectionFenetre(m: Modele, w: FenetreVue, o: { readonly separateur?: "." | ","; readonly precision?: number } = {}): { readonly scene: Scene | undefined; readonly plan: PlanProjete; readonly cotes: readonly CoteProjetee[] } {
  const scene = w.scene ? m.annotations?.scenes?.[w.scene] : undefined;
  const vue: VueProjection = scene ? { direction: { x: scene.cible.x - scene.position.x, y: scene.cible.y - scene.position.y, z: scene.cible.z - scene.position.z } } : DESSUS;
  const plan: PlanDeCoupe | null = w.coupe === "aucune" ? null : w.coupe === null ? planDeCoupeActif(m) : (m.annotations?.plansDeCoupe[w.coupe] ?? null);
  const R = repereVue(vue);
  const pr = (p: { x: number; y: number; z: number }): P2 => ({ x: dot(p, R.x), y: dot(p, R.y) });
  const garde = (p: { x: number; y: number; z: number }) => !plan || dot(plan.normale, { x: p.x - plan.origine.x, y: p.y - plan.origine.y, z: p.z - plan.origine.z }) * (plan.inverse ? -1 : 1) <= 1e-9;
  // Pas « écran » choisi pour que les extrémités fassent environ 2 mm papier (8 pas) à l'échelle de la fenêtre.
  const pas = (0.25 * w.echelle) / 1000;
  const cotes: CoteProjetee[] = [];
  for (const c of Object.values(m.annotations?.cotes ?? {})) {
    const d = dessinerCote(m, c, pas, o.precision ?? 2, o.separateur ?? ",");
    if (!d || d.orpheline) continue;
    const pts = d.lignes.flat();
    if (!pts.every(garde)) continue;
    const p2 = pts.map(pr);
    const xs = p2.map((p) => p.x);
    const ys = p2.map((p) => p.y);
    if (Math.max(...xs) - Math.min(...xs) < 1e-6 && Math.max(...ys) - Math.min(...ys) < 1e-6) continue;
    cotes.push({ lignes: d.lignes.map((l) => l.map(pr)), etiquette: pr(d.etiquette), texte: d.texte });
  }
  return { scene, plan: projeterPlan(m, vue, { plan }), cotes };
}

/** Compose une feuille : cadre, fenêtres de vue (plan vectoriel à l'échelle), titres des vues, cartouche. */
export function composerFeuille(m: Modele, f: Feuille, l: LibellesFeuille): CompositionFeuille {
  const { largeur, hauteur } = dimensionsFeuille(f);
  const prims: PrimitiveFeuille[] = [];
  const cadre = { x: CADRE.reliure, y: CADRE.marge, largeur: largeur - CADRE.reliure - CADRE.marge, hauteur: hauteur - 2 * CADRE.marge };
  prims.push({ genre: "cadre", ...cadre, epaisseur: 0.7 });
  const fenetres: FenetreComposee[] = [];
  const motifs = m.annotations?.motifs ?? {};
  const materiaux = m.annotations?.materiaux ?? {};
  f.fenetres.forEach((w, i) => {
    const { scene, plan: p, cotes } = projectionFenetre(m, w, l.separateur ? { separateur: l.separateur } : {});
    const k = 1000 / w.echelle;
    const c = p.cadre ?? { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
    const X = (q: P2): P2 => ({ x: w.x + (q.x - c.min.x) * k, y: w.y + (c.max.y - q.y) * k });
    for (const po of p.poches) {
      const motif = po.materiau ? materiaux[po.materiau]?.motif : undefined;
      prims.push({ genre: "poche", boucles: po.boucles.map((b) => b.map(X)), motif: motif ? (motifs[motif] ?? null) : null, ...(po.statut ? { statut: po.statut } : {}) });
    }
    for (const cl of ["vu", "cache", "coupe"] as const)
      for (const t of p.traits) if (t.classe === cl) prims.push({ genre: "trait", a: X(t.a), b: X(t.b), epaisseur: EPAISSEURS_TRAITS[cl], classe: cl, ...(cl === "cache" ? { tirets: TIRETS_CACHE } : {}), ...(t.statut ? { statut: t.statut } : {}) });
    for (const ct of cotes) {
      for (const li of ct.lignes) for (let j = 1; j < li.length; j++) prims.push({ genre: "trait", a: X(li[j - 1]!), b: X(li[j]!), epaisseur: 0.18, classe: "cote" });
      const e = X(ct.etiquette);
      prims.push({ genre: "texte", x: e.x, y: e.y - 0.8, taille: 2.5, texte: ct.texte, ancre: "milieu", cote: true });
    }
    const lw = (c.max.x - c.min.x) * k;
    const hw = (c.max.y - c.min.y) * k;
    const titre = scene ? scene.nom : l.vueDessus;
    prims.push({ genre: "texte", x: w.x, y: w.y + hw + 5, taille: 3.5, texte: `${i + 1} — ${titre}`, gras: true });
    prims.push({ genre: "texte", x: w.x + Math.max(lw, 30), y: w.y + hw + 5, taille: 3.5, texte: `1:${w.echelle}`, ancre: "fin" });
    const depasse = w.x < cadre.x || w.y < cadre.y || w.x + lw > cadre.x + cadre.largeur || w.y + hw + 6 > cadre.y + cadre.hauteur;
    fenetres.push({ id: w.id, x: w.x, y: w.y, largeur: lw, hauteur: hw, echelle: w.echelle, titre, depasse, vide: p.traits.length === 0 });
  });
  const echelles = [...new Set(f.fenetres.map((w) => w.echelle))].sort((a, b) => a - b);
  // Cartouche : trois rangs de 9 mm ; libellé au-dessus de la valeur, un champ vide reste vide.
  const R = CARTOUCHE.rang;
  const x0 = cadre.x + cadre.largeur - CARTOUCHE.largeur;
  const y0 = cadre.y + cadre.hauteur - 3 * R;
  prims.push({ genre: "cadre", x: x0, y: y0, largeur: CARTOUCHE.largeur, hauteur: 3 * R, epaisseur: 0.5 });
  for (const yy of [y0 + R, y0 + 2 * R]) prims.push({ genre: "trait", a: { x: x0, y: yy }, b: { x: x0 + CARTOUCHE.largeur, y: yy }, epaisseur: 0.25 });
  prims.push({ genre: "trait", a: { x: x0 + 110, y: y0 }, b: { x: x0 + 110, y: y0 + 3 * R }, epaisseur: 0.25 });
  prims.push({ genre: "trait", a: { x: x0 + 145, y: y0 + 2 * R }, b: { x: x0 + 145, y: y0 + 3 * R }, epaisseur: 0.25 });
  const champ = (x: number, rang: number, libelle: string, valeur: string, gras = false) => {
    prims.push({ genre: "texte", x: x + 1.5, y: y0 + rang * R + 3, taille: 2, texte: libelle, gris: true });
    if (valeur) prims.push({ genre: "texte", x: x + 1.5, y: y0 + rang * R + 7.4, taille: gras ? 3.5 : 3, texte: valeur, gras });
  };
  champ(x0, 0, l.projet, f.cartouche.projet, true);
  champ(x0 + 110, 0, l.phase, f.cartouche.phase);
  champ(x0, 1, l.titre, f.nom, true);
  champ(x0 + 110, 1, l.echelles, echelles.map((e) => `1:${e}`).join(" · "));
  champ(x0, 2, l.date, f.cartouche.date);
  champ(x0 + 110, 2, l.numero, f.numero, true);
  champ(x0 + 145, 2, l.indice, f.indice, true);
  return { largeur, hauteur, primitives: prims, fenetres, echelles };
}

// ————————————————————————————————————————————————————————————— SVG (aperçu)

const n3 = (v: number): string => String(Math.round(v * 1000) / 1000);
const echapperXml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const APLAT = "rgb(217,217,217)";

/** Aperçu SVG de la feuille, en millimètres. `surligne` : fenêtre encadrée en bleu. */
export function svgFeuille(c: CompositionFeuille, o: { readonly surligne?: string | null } = {}): string {
  const defs: string[] = [];
  const corps: string[] = [];
  const vus = new Set<string>();
  for (const p of c.primitives) {
    if (p.genre === "cadre") corps.push(`<rect x="${n3(p.x)}" y="${n3(p.y)}" width="${n3(p.largeur)}" height="${n3(p.hauteur)}" fill="none" stroke="rgb(0,0,0)" stroke-width="${n3(p.epaisseur)}"/>`);
    else if (p.genre === "trait") corps.push(`<line x1="${n3(p.a.x)}" y1="${n3(p.a.y)}" x2="${n3(p.b.x)}" y2="${n3(p.b.y)}" stroke="rgb(0,0,0)" stroke-width="${n3(p.epaisseur)}" stroke-linecap="round"${p.tirets ? ` stroke-dasharray="${p.tirets.map(n3).join(" ")}"` : ""}/>`);
    else if (p.genre === "texte") corps.push(`<text x="${n3(p.x)}" y="${n3(p.y)}" font-family="Helvetica, Arial, sans-serif" font-size="${n3(p.taille)}"${p.gras ? ' font-weight="700"' : ""}${p.gris ? ' fill="rgb(110,110,110)"' : ""}${p.ancre === "fin" ? ' text-anchor="end"' : p.ancre === "milieu" ? ' text-anchor="middle"' : ""}>${echapperXml(p.texte)}</text>`);
    else {
      const d = p.boucles.map((b) => `M${b.map((q) => `${n3(q.x)} ${n3(q.y)}`).join(" L")} Z`).join(" ");
      corps.push(`<path d="${d}" fill="${p.motif ? "rgb(255,255,255)" : APLAT}" fill-rule="evenodd"/>`);
      if (p.motif) {
        if (!vus.has(p.motif.id)) {
          vus.add(p.motif.id);
          p.motif.familles.forEach((f, i) => {
            // Comme svgPlan : tuile d'une période de tirets, décalage dx d'une ligne à la suivante rendu par un cisaillement.
            const traits = f.tirets.map((t) => Math.max(Math.abs(t), 0.05));
            const periode = traits.length ? traits.reduce((a, b) => a + b, 0) * (traits.length % 2 ? 2 : 1) : 1000;
            const cisaillement = f.dx !== 0 ? ` skewX(${n3((Math.atan2(f.dx, f.dy) * 180) / Math.PI)})` : "";
            defs.push(`<pattern id="${p.motif!.id}-${i}" patternUnits="userSpaceOnUse" width="${n3(periode)}" height="${n3(Math.abs(f.dy))}" patternTransform="rotate(${n3(-f.angle)}) translate(${n3(f.x0)} ${n3(f.y0)})${cisaillement}"><line x1="0" y1="0" x2="${n3(periode)}" y2="0" stroke="rgb(0,0,0)" stroke-width="0.13"${traits.length ? ` stroke-dasharray="${traits.map(n3).join(" ")}"` : ""}/></pattern>`);
          });
        }
        p.motif.familles.forEach((_f, i) => corps.push(`<path d="${d}" fill="url(#${p.motif!.id}-${i})" fill-rule="evenodd"/>`));
      }
    }
  }
  const s = c.fenetres.find((w) => w.id === o.surligne);
  if (s) corps.push(`<rect x="${n3(s.x - 2)}" y="${n3(s.y - 2)}" width="${n3(Math.max(s.largeur, 30) + 4)}" height="${n3(s.hauteur + 4)}" fill="none" stroke="rgb(26,95,214)" stroke-width="0.8" stroke-dasharray="3 2"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n3(c.largeur)}mm" height="${n3(c.hauteur)}mm" viewBox="0 0 ${n3(c.largeur)} ${n3(c.hauteur)}"><rect width="${n3(c.largeur)}" height="${n3(c.hauteur)}" fill="rgb(255,255,255)"/>${defs.length ? `<defs>${defs.join("")}</defs>` : ""}${corps.join("")}</svg>`;
}

// ————————————————————————————————————————————————————————————— PDF vectoriel

const MM = 72 / 25.4;
const n4 = (v: number): string => (Math.round(v * 10000) / 10000).toString();
/** Caractères hors Latin-1 rendus en WinAnsi (police standard) ; le reste devient « ? ». */
const WINANSI: Record<string, number> = { "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "œ": 0x9c, "Œ": 0x8c, " ": 0xa0, " ": 0x20 };
function chainePdf(t: string): string {
  let r = "(";
  for (const ch of t) {
    const code = WINANSI[ch] ?? (ch.codePointAt(0)! < 256 && !(ch.codePointAt(0)! >= 0x80 && ch.codePointAt(0)! < 0xa0) ? ch.codePointAt(0)! : 0x3f);
    if (code === 0x28 || code === 0x29 || code === 0x5c) r += `\\${String.fromCharCode(code)}`;
    else if (code < 0x20 || code > 0x7e) r += `\\${code.toString(8).padStart(3, "0")}`;
    else r += String.fromCharCode(code);
  }
  return `${r})`;
}
/** Chaîne de métadonnées (dictionnaire Info) : UTF-16BE en hexadécimal, lisible quel que soit l'alphabet. */
function texteUnicode(t: string): string {
  let h = "<FEFF";
  for (let i = 0; i < t.length; i++) h += t.charCodeAt(i).toString(16).toUpperCase().padStart(4, "0");
  return `${h}>`;
}
/** Largeur approchée d'un texte en Helvetica (chasse moyenne ; chiffres et deux-points exacts) pour l'alignement à droite. */
function largeurTexte(t: string, taille: number): number {
  let u = 0;
  for (const ch of t) u += /[0-9]/.test(ch) ? 0.556 : ch === ":" || ch === " " || ch === "." ? 0.278 : 0.56;
  return u * taille;
}

/** Repère d'une famille sur le papier et rangs de ses lignes qui traversent les boucles. */
function rangsHachure(boucles: readonly (readonly P2[])[], f: FamilleHachure) {
  const pts = boucles.flat();
  const a = (f.angle * Math.PI) / 180;
  // Repère du papier : y vers le bas, l'angle compte dans le sens trigonométrique vu sur la feuille.
  const u = { x: Math.cos(a), y: -Math.sin(a) };
  const nrm = { x: -u.y, y: u.x };
  const pas = Math.abs(f.dy);
  const proj = pts.map((p) => p.x * nrm.x + p.y * nrm.y);
  const long = pts.map((p) => p.x * u.x + p.y * u.y);
  const o0 = f.x0 * nrm.x + f.y0 * nrm.y;
  return { u, nrm, pas, long, o0, debut: Math.floor((Math.min(...proj) - o0) / pas), fin: Math.ceil((Math.max(...proj) - o0) / pas) };
}

/**
 * Poches dont une famille de hachure demanderait plus de LIGNES_HACHURE_MAX lignes au PDF : l'export est alors refusé
 * (le PDF ne tronque ni n'omet jamais une hachure). Renvoie le nombre de familles en excès.
 */
export function hachuresTropDenses(pages: readonly CompositionFeuille[]): number {
  let n = 0;
  for (const c of pages)
    for (const p of c.primitives)
      if (p.genre === "poche" && p.motif)
        for (const f of p.motif.familles) {
          const r = rangsHachure(p.boucles, f);
          if (r.fin - r.debut > LIGNES_HACHURE_MAX) n++;
        }
  return n;
}

function hachures(boucles: readonly (readonly P2[])[], f: FamilleHachure): string {
  const { u, nrm, pas, long, o0, debut, fin } = rangsHachure(boucles, f);
  if (fin - debut > LIGNES_HACHURE_MAX) throw new Error("hachure trop dense : contrôler avec hachuresTropDenses avant l'export");
  const l0 = Math.min(...long) - 1;
  const l1 = Math.max(...long) + 1;
  const traits = f.tirets.map((t) => Math.max(Math.abs(t), 0.05));
  const periode = traits.reduce((x, y) => x + y, 0) * (traits.length % 2 ? 2 : 1);
  // Origine longitudinale de la famille (x0, y0) et glissement de k·dx de la ligne de rang k, comme dans le .pat :
  // la phase des tirets de chaque ligne part de là, pas du bord de la poche.
  const l00 = f.x0 * u.x + f.y0 * u.y;
  let s = `0.13 w${traits.length ? "" : " [] 0 d"}\n`;
  for (let i = debut; i <= fin; i++) {
    const o = o0 + i * pas;
    const A = { x: nrm.x * o + u.x * l0, y: nrm.y * o + u.y * l0 };
    const B = { x: nrm.x * o + u.x * l1, y: nrm.y * o + u.y * l1 };
    const phase = traits.length ? (((l0 - (l00 + i * f.dx)) % periode) + periode) % periode : 0;
    s += `${traits.length ? `[${traits.map(n4).join(" ")}] ${n4(phase)} d ` : ""}${n4(A.x)} ${n4(A.y)} m ${n4(B.x)} ${n4(B.y)} l S\n`;
  }
  return s;
}

function contenuPage(c: CompositionFeuille): string {
  // Unité : le millimètre, y vers le bas (1 mm = 72 / 25,4 pt).
  let s = `q ${n4(MM)} 0 0 ${n4(-MM)} 0 ${n4(c.hauteur * MM)} cm 1 J 1 j 0 G 0 g\n`;
  for (const p of c.primitives) {
    if (p.genre === "cadre") s += `${n4(p.epaisseur)} w [] 0 d ${n4(p.x)} ${n4(p.y)} ${n4(p.largeur)} ${n4(p.hauteur)} re S\n`;
    else if (p.genre === "trait") s += `${n4(p.epaisseur)} w ${p.tirets ? `[${p.tirets.map(n4).join(" ")}] 0 d` : "[] 0 d"} ${n4(p.a.x)} ${n4(p.a.y)} m ${n4(p.b.x)} ${n4(p.b.y)} l S\n`;
    else if (p.genre === "texte") {
      const x = p.ancre === "fin" ? p.x - largeurTexte(p.texte, p.taille) : p.ancre === "milieu" ? p.x - largeurTexte(p.texte, p.taille) / 2 : p.x;
      s += `${p.gris ? "0.43 g " : ""}BT /${p.gras ? "F2" : "F1"} ${n4(p.taille)} Tf 1 0 0 -1 ${n4(x)} ${n4(p.y)} Tm ${chainePdf(p.texte)} Tj ET${p.gris ? " 0 g" : ""}\n`;
    } else {
      const chemin = p.boucles.map((b) => `${b.map((q, i) => `${n4(q.x)} ${n4(q.y)} ${i ? "l" : "m"}`).join(" ")} h`).join(" ");
      s += p.motif ? `1 g ${chemin} f* 0 g\n` : `0.851 g ${chemin} f* 0 g\n`;
      if (p.motif) {
        s += `q ${chemin} W* n\n`;
        for (const f of p.motif.familles) s += hachures(p.boucles, f);
        s += "Q\n";
      }
    }
  }
  return `${s}Q\n`;
}

/** PDF vectoriel (1.4) : une page par feuille, à sa taille exacte ; polices standard Helvetica. */
export function pdfFeuilles(pages: readonly CompositionFeuille[], titre: string): Uint8Array {
  const objets: string[] = [];
  const ajouter = (corps: string) => objets.push(corps);
  // 1 catalogue, 2 pages, 3 police, 4 police grasse, 5 infos, puis page / contenu par feuille.
  ajouter("<< /Type /Catalog /Pages 2 0 R >>");
  const kids = pages.map((_p, i) => `${6 + 2 * i} 0 R`).join(" ");
  ajouter(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  ajouter("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  ajouter("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  ajouter(`<< /Title ${texteUnicode(titre)} /Producer (Fadi) >>`);
  pages.forEach((c, i) => {
    const contenu = contenuPage(c);
    ajouter(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n4(c.largeur * MM)} ${n4(c.hauteur * MM)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${7 + 2 * i} 0 R >>`);
    ajouter(`<< /Length ${contenu.length} >>\nstream\n${contenu}endstream`);
  });
  let sortie = "%PDF-1.4\n%âãÏÓ\n";
  const positions: number[] = [];
  objets.forEach((o, i) => {
    positions.push(sortie.length);
    sortie += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = sortie.length;
  sortie += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n${positions.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("")}`;
  sortie += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const octets = new Uint8Array(sortie.length);
  for (let i = 0; i < sortie.length; i++) octets[i] = sortie.charCodeAt(i) & 0xff;
  return octets;
}

/** Relecture d'un PDF émis : formats des pages en millimètres (contrôle de l'échelle exacte), ou `null` si illisible. */
export function relirePdf(octets: Uint8Array): { readonly pages: readonly { readonly largeur: number; readonly hauteur: number }[] } | null {
  let t = "";
  for (let i = 0; i < octets.length; i++) t += String.fromCharCode(octets[i]!);
  if (!t.startsWith("%PDF-") || !t.trimEnd().endsWith("%%EOF")) return null;
  const pages = [...t.matchAll(/\/MediaBox \[0 0 ([0-9.]+) ([0-9.]+)\]/g)].map((x) => ({ largeur: Math.round((Number(x[1]) / MM) * 100) / 100, hauteur: Math.round((Number(x[2]) / MM) * 100) / 100 }));
  return pages.length ? { pages } : null;
}
