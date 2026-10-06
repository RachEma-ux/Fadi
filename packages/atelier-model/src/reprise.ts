/**
 * Réutilisation de modèle (DA-21-09) — pure. Reprendre, depuis un modèle source (un autre projet, une de ses versions,
 * une variante), les familles d'objets choisies dans le modèle cible, sans jamais transférer de valeur par défaut :
 *
 * - nouveaux identifiants stables dans la cible (préfixe `reprise`), références remappées explicitement (hôtes
 *   d'ouvertures, niveaux, calques, groupes, définitions, relations, références d'annotations, vues des feuilles) ;
 * - une référence dont la cible n'est pas reprise passe « à réparer » (références d'annotations) ou est retirée et
 *   dite (étiquette sans objet, mur sans niveau haut) ; une ouverture dont le mur n'est pas repris n'est pas reprise ;
 * - niveaux : appariés à un niveau cible de même altitude (± 5 mm) ou créés ; calques et définitions de même nom :
 *   réutilisés ou renommés selon le choix — jamais fusionnés en silence ;
 * - site (parcelle, emprise), hypothèses, sources, structure déclarée : repris seulement s'ils sont cochés ; une
 *   parcelle n'écrase jamais celle du projet cible ;
 * - chaque objet repris porte sa provenance (`reprise:origine`, provenance « import ») : projet, révision, empreinte.
 * Le résultat est appliqué par la commande `modele.reprendre` (une révision, inverse exact, journal).
 */
import type { Commande } from "./commandes/index.js";
import { empreinteDe } from "./documents/empreinte.js";
import { definitionsImbriquees } from "./blocs-places.js";
import type { Calque, Definition, Groupe, ModeleAtelier, Niveau, OccurrenceQuelconque, Reference, Relation } from "./modele.js";

export const FAMILLES_REPRISE = {
  architecture: ["mur", "porte", "fenetre", "ouverture", "dalle", "toiture", "escalier", "poteau", "garde-corps"],
  espaces: ["piece", "espace", "zone"],
  dessin: ["esquisse", "cotation", "texte", "etiquette", "reference-plan", "solide", "bloc-occurrence", "objet-importe"],
} as const;
/**
 * `documents` : vues et feuilles ; `definitions` : la bibliothèque de définitions de la source (types, blocs,
 * composants), même sans occurrence — un projet sert ainsi de bibliothèque partagée entre projets.
 */
export type FamilleReprise = keyof typeof FAMILLES_REPRISE | "documents" | "definitions";

export interface OptionsReprise {
  familles: FamilleReprise[];
  /** Niveaux source repris (tous si absent). */
  niveaux?: string[] | undefined;
  site?: boolean | undefined;
  hypotheses?: boolean | undefined;
  sources?: boolean | undefined;
  structure?: boolean | undefined;
  /** Calques et définitions de même nom dans la cible. */
  homonymes?: "reutiliser" | "renommer" | undefined;
  origine: { projet: string; nom: string; revision: number };
  prefixe?: string | undefined;
  /** Sélection spatiale (repère local de la source) : seuls les objets entièrement dans ce rectangle sont repris. */
  zone?: { min: { x: number; y: number }; max: { x: number; y: number } } | undefined;
  /** Famille `definitions` : seuls les blocs et composants de cette bibliothèque (nom exact) ; toutes si absent. */
  bibliotheque?: string | undefined;
}

/** Points caractéristiques d'un objet en plan (pour la sélection spatiale) ; une ouverture suit son mur. */
function pointsEnPlan(o: OccurrenceQuelconque): { x: number; y: number }[] {
  const p = o.params as unknown as Record<string, unknown>;
  const out: { x: number; y: number }[] = [];
  const estPoint = (v: unknown): v is { x: number; y: number } => !!v && typeof v === "object" && typeof (v as { x?: unknown }).x === "number" && typeof (v as { y?: unknown }).y === "number";
  for (const cle of ["a", "b", "point", "position", "centre"]) if (estPoint(p[cle])) out.push(p[cle]);
  for (const cle of ["contour", "points", "empreinte"]) if (Array.isArray(p[cle])) for (const q of p[cle] as unknown[]) if (estPoint(q)) out.push(q);
  if (Array.isArray(p["polygones"])) for (const pg of p["polygones"] as { contour?: unknown[] }[]) for (const q of pg.contour ?? []) if (estPoint(q)) out.push(q);
  return out;
}

export interface RapportReprise {
  source: { projet: string; nom: string; revision: number; empreinte: string };
  parClasse: { classe: string; source: number; reprises: number }[];
  niveaux: { source: string; cible: string; action: "apparie" | "cree" }[];
  homonymes: { nature: "calque" | "definition"; nom: string; action: "reutilise" | "renomme" }[];
  aReparer: string[];
  nonRepris: { id: string; motif: string }[];
  remarques: string[];
}

export interface PlanReprise {
  commande: Commande | null;
  rapport: RapportReprise;
}

const CLES_REF = new Set(["murHoteId", "objetId", "niveauId", "niveauDepartId", "niveauArriveeId", "niveauHautId", "definitionId", "vueId", "calqueId", "groupeId", "sourceId", "targetId", "proprietaireId", "objetA", "objetB"]);

/** Remplace, dans un JSON, les valeurs des clés de référence présentes dans la table de correspondance. */
function remapper<T>(v: T, table: Map<string, string>): T {
  if (Array.isArray(v)) return v.map((x) => remapper(x, table)) as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = CLES_REF.has(k) && typeof x === "string" && table.has(x) ? table.get(x) : remapper(x, table);
    return out as T;
  }
  return v;
}

const memeNom = (a: string, b: string) => a.trim().toLocaleLowerCase("fr") === b.trim().toLocaleLowerCase("fr");

export function planifierReprise(source: ModeleAtelier, cible: ModeleAtelier, options: OptionsReprise): PlanReprise {
  const prefixe = options.prefixe ?? "reprise";
  const empreinte = empreinteDe(source);
  const rapport: RapportReprise = { source: { ...options.origine, empreinte }, parClasse: [], niveaux: [], homonymes: [], aReparer: [], nonRepris: [], remarques: [] };
  const classes = new Set<string>(options.familles.flatMap((f) => (f === "documents" || f === "definitions" ? [] : [...FAMILLES_REPRISE[f]])));
  const avecDocuments = options.familles.includes("documents");
  const niveauxSource = Object.values(source.niveaux).filter((n) => !options.niveaux || options.niveaux.includes(n.id));
  const nid = (id: string) => {
    let k = `${prefixe}-${id}`;
    let i = 2;
    while (cible.objets[k] || cible.niveaux[k] || cible.definitions[k] || cible.calques[k] || cible.groupes[k] || cible.relations[k] || cible.references[k]) k = `${prefixe}${i++}-${id}`;
    return k;
  };
  const table = new Map<string, string>();
  const ajouts: { niveaux: Record<string, Niveau>; objets: Record<string, OccurrenceQuelconque>; relations: Record<string, Relation>; definitions: Record<string, Definition>; calques: Record<string, Calque>; groupes: Record<string, Groupe>; references: Record<string, Reference> } = { niveaux: {}, objets: {}, relations: {}, definitions: {}, calques: {}, groupes: {}, references: {} };

  // Niveaux : appariés par altitude, sinon créés.
  let ordre = Object.keys(cible.niveaux).length;
  for (const n of niveauxSource.sort((a, b) => a.elevation - b.elevation)) {
    const existant = Object.values(cible.niveaux).find((c) => Math.abs(c.elevation - n.elevation) <= 0.005);
    if (existant) {
      table.set(n.id, existant.id);
      rapport.niveaux.push({ source: n.nom, cible: existant.nom, action: "apparie" });
    } else {
      const id = nid(n.id);
      table.set(n.id, id);
      ajouts.niveaux[id] = { ...n, id, ordre: ordre++ };
      rapport.niveaux.push({ source: n.nom, cible: n.nom, action: "cree" });
    }
  }
  const niveauxRepris = new Set(niveauxSource.map((n) => n.id));

  // Objets retenus : familles cochées, sur les niveaux retenus ; une ouverture suit son mur.
  const z = options.zone;
  const dansZone = (o: OccurrenceQuelconque) => {
    if (!z || o.classe === "porte" || o.classe === "fenetre" || o.classe === "ouverture") return true;
    const pts = pointsEnPlan(o);
    return pts.length > 0 && pts.every((q) => q.x >= z.min.x - 1e-9 && q.x <= z.max.x + 1e-9 && q.y >= z.min.y - 1e-9 && q.y <= z.max.y + 1e-9);
  };
  const retenus = (Object.values(source.objets) as OccurrenceQuelconque[]).filter((o) => classes.has(o.classe) && (!o.niveauId || niveauxRepris.has(o.niveauId)) && dansZone(o));
  if (z) rapport.remarques.push(`Sélection spatiale : objets entièrement dans le rectangle (${z.min.x} ; ${z.min.y}) – (${z.max.x} ; ${z.max.y}) du repère local de la source.`);
  const idsRetenus = new Set(retenus.map((o) => o.id));
  const objets: OccurrenceQuelconque[] = [];
  for (const o of retenus) {
    if ((o.classe === "porte" || o.classe === "fenetre" || o.classe === "ouverture") && !idsRetenus.has(o.params.murHoteId)) {
      rapport.nonRepris.push({ id: o.id, motif: `mur hôte ${o.params.murHoteId} non repris` });
      continue;
    }
    if (o.classe === "escalier" && !niveauxRepris.has(o.params.niveauDepartId)) {
      rapport.nonRepris.push({ id: o.id, motif: `niveau de départ ${o.params.niveauDepartId} non repris` });
      continue;
    }
    objets.push(o);
  }
  for (const o of objets) table.set(o.id, nid(o.id));
  const comptes = new Map<string, { source: number; reprises: number }>();
  for (const o of Object.values(source.objets) as OccurrenceQuelconque[]) if (classes.has(o.classe)) comptes.set(o.classe, { source: (comptes.get(o.classe)?.source ?? 0) + 1, reprises: comptes.get(o.classe)?.reprises ?? 0 });

  // Calques, groupes et définitions utilisés (et documents s'ils sont cochés).
  const homonyme = (nature: "calque" | "definition", nom: string, existant: string | undefined, id: string, nouveau: () => void) => {
    if (existant && (options.homonymes ?? "reutiliser") === "reutiliser") {
      table.set(id, existant);
      rapport.homonymes.push({ nature, nom, action: "reutilise" });
    } else {
      if (existant) rapport.homonymes.push({ nature, nom, action: "renomme" });
      nouveau();
    }
  };
  const definitionsUtilisees = new Set(objets.map((o) => o.definitionId).filter((x): x is string => !!x && x !== "non-type"));
  if (avecDocuments) for (const d of Object.values(source.definitions)) if ((d.classe as string) === "vue" || (d.classe as string) === "feuille") definitionsUtilisees.add(d.id);
  if (options.familles.includes("definitions")) {
    const avant = definitionsUtilisees.size;
    for (const d of Object.values(source.definitions)) {
      if (["vue", "feuille", "reference-externe", "vue-3d", "referentiel-classification", "ensemble-affichage", "etat-calques"].includes(d.classe as string)) continue;
      const bib = (d.params as { bibliotheque?: string | null }).bibliotheque ?? null;
      if (options.bibliotheque && bib !== options.bibliotheque) continue;
      definitionsUtilisees.add(d.id);
    }
    rapport.remarques.push(options.bibliotheque ? `Bibliothèque « ${options.bibliotheque} » : ${definitionsUtilisees.size - avant} définition(s) de blocs et composants retenue(s) en plus des définitions utilisées.` : `Bibliothèque de définitions : ${definitionsUtilisees.size - avant} définition(s) retenue(s) en plus des définitions utilisées (types, blocs, composants).`);
  }
  // Blocs imbriqués (D-078) : les définitions placées dans les blocs repris suivent.
  for (const id of [...definitionsUtilisees]) for (const x of definitionsImbriquees(source, id)) definitionsUtilisees.add(x);
  const homonymeDefinition = (d: Definition) => Object.values(cible.definitions).find((x) => x.classe === d.classe && memeNom(x.nom, d.nom));
  const calquesUtilises = new Set(objets.map((o) => o.calqueId).filter((x): x is string => !!x));
  // Calques du contenu des blocs et composants copiés (pas de ceux qui seront remplacés par un homonyme réutilisé).
  for (const id of definitionsUtilisees) {
    const d = source.definitions[id];
    if (!d || (d.classe !== "bloc" && d.classe !== "composant")) continue;
    if (homonymeDefinition(d) && (options.homonymes ?? "reutiliser") === "reutiliser") continue;
    for (const e of ((d.params as { contenu?: { calqueId?: string | null }[] }).contenu ?? [])) if (e.calqueId) calquesUtilises.add(e.calqueId);
  }
  for (const id of calquesUtilises) {
    const c = source.calques[id];
    if (!c) continue;
    const existant = Object.values(cible.calques).find((x) => memeNom(x.nom, c.nom));
    homonyme("calque", c.nom, existant?.id, id, () => {
      const n = nid(id);
      table.set(id, n);
      ajouts.calques[n] = { ...c, id: n, nom: existant ? `${c.nom} (reprise)` : c.nom, ordre: Object.keys(cible.calques).length + Object.keys(ajouts.calques).length };
    });
  }
  // Calques imbriqués (D-080) : parent remappé s'il est repris, sinon le calque passe à la racine.
  for (const c of Object.values(ajouts.calques)) {
    if (!c.parentId) continue;
    const parent = table.get(c.parentId);
    const { parentId: _p, ...reste } = c;
    void _p;
    ajouts.calques[c.id] = parent ? { ...reste, parentId: parent } : reste;
  }
  for (const id of new Set(objets.map((o) => o.groupeId).filter((x): x is string => !!x))) {
    const g = source.groupes[id];
    if (!g) continue;
    const n = nid(id);
    table.set(id, n);
    // Réseau associatif (D-115) : ses sources et copies ne sont pas reprises comme telles — le groupe repris est ordinaire.
    const { reseau: _r, ...gSans } = g;
    void _r;
    ajouts.groupes[n] = { ...gSans, id: n };
  }
  for (const id of definitionsUtilisees) {
    const d = source.definitions[id];
    if (!d) continue;
    if ((d.classe as string) === "vue") {
      const nv = (d.params as { niveauId?: string | null }).niveauId;
      if (nv && !niveauxRepris.has(nv)) {
        rapport.nonRepris.push({ id, motif: "vue d'un niveau non repris" });
        continue;
      }
    }
    const existant = homonymeDefinition(d);
    homonyme("definition", d.nom, existant?.id, id, () => {
      const n = nid(id);
      table.set(id, n);
      ajouts.definitions[n] = { ...d, id: n, nom: existant ? `${d.nom} (reprise)` : d.nom };
    });
  }
  // Contenu des blocs et composants copiés : calques remappés (un calque non repris est retiré).
  for (const d of Object.values(ajouts.definitions)) {
    if (d.classe !== "bloc" && d.classe !== "composant") continue;
    const contenu = ((d.params as { contenu?: { calqueId?: string | null; definitionId?: string | null }[] }).contenu ?? []).map((e) => ({ ...e, calqueId: e.calqueId && table.has(e.calqueId) ? table.get(e.calqueId)! : null, ...(e.definitionId ? { definitionId: table.get(e.definitionId) ?? e.definitionId } : {}) }));
    d.params = { ...d.params, contenu };
  }
  // Une feuille ne garde que les vues reprises.
  for (const d of Object.values(ajouts.definitions)) {
    if ((d.classe as string) !== "feuille") continue;
    const vues = (d.params as { vues?: { vueId: string }[] }).vues ?? [];
    const gardees = vues.filter((v) => table.has(v.vueId));
    if (gardees.length !== vues.length) rapport.remarques.push(`Feuille « ${d.nom} » : ${vues.length - gardees.length} vue(s) non reprise(s) retirée(s).`);
    d.params = { ...d.params, vues: gardees };
  }

  // Objets remappés, provenance posée ; références sans cible retirées et dites.
  const origine = `${options.origine.nom} (projet ${options.origine.projet}, révision ${options.origine.revision}, empreinte ${empreinte})`;
  for (const o of objets) {
    const id = table.get(o.id)!;
    const copie = remapper({ ...o, id }, table) as OccurrenceQuelconque;
    if (copie.definitionId && !table.has(o.definitionId!) && copie.definitionId !== "non-type") copie.definitionId = null;
    if (copie.calqueId && o.calqueId && !table.has(o.calqueId)) copie.calqueId = null;
    const p = copie.params as unknown as Record<string, unknown>;
    if (o.classe === "etiquette" && typeof p["objetId"] === "string" && !table.has(p["objetId"] as string)) {
      p["objetId"] = null;
      rapport.remarques.push(`Étiquette ${o.id} : objet visé non repris, étiquette gardée sans lien.`);
    }
    if (o.classe === "mur" && typeof p["niveauHautId"] === "string" && !table.has(p["niveauHautId"] as string)) {
      p["niveauHautId"] = null;
      rapport.remarques.push(`Mur ${o.id} : niveau haut non repris, lien retiré.`);
    }
    if (o.classe === "escalier" && typeof p["niveauArriveeId"] === "string" && !table.has(o.params.niveauArriveeId ?? "")) {
      p["niveauArriveeId"] = null;
      rapport.remarques.push(`Escalier ${o.id} : niveau d'arrivée non repris, lien retiré.`);
    }
    copie.proprietes = { ...copie.proprietes, "reprise:origine": { valeur: `${origine} · objet ${o.id}`, provenance: "import", statut: "declaree" } };
    ajouts.objets[id] = copie;
    const c = comptes.get(o.classe);
    if (c) c.reprises++;
  }
  // Relations entre objets repris (les deux extrémités).
  for (const r of Object.values(source.relations)) {
    if (!table.has(r.sourceId) || !table.has(r.targetId)) continue;
    const id = nid(r.id);
    ajouts.relations[id] = remapper({ ...r, id }, table);
  }
  // Références des annotations reprises : remappées, ou « à réparer » si l'objet visé n'est pas repris.
  for (const r of Object.values(source.references)) {
    if (!table.has(r.proprietaireId)) continue;
    const proprietaire = table.get(r.proprietaireId)!;
    const id = r.id.startsWith(r.proprietaireId) ? proprietaire + r.id.slice(r.proprietaireId.length) : nid(r.id);
    if (r.objetId && !table.has(r.objetId)) {
      ajouts.references[id] = { ...r, id, proprietaireId: proprietaire, objetId: null, etat: "a-reparer", propositions: [] };
      rapport.aReparer.push(id);
    } else ajouts.references[id] = { ...r, id, proprietaireId: proprietaire, objetId: r.objetId ? table.get(r.objetId)! : null };
  }

  // Niveaux créés mais sans objet ni vue repris : retirés (aucun niveau vide n'est ajouté).
  const niveauxUtilises = new Set([...Object.values(ajouts.objets).map((o) => o.niveauId), ...Object.values(ajouts.definitions).map((d) => (d.params as { niveauId?: string | null }).niveauId)]);
  for (const id of Object.keys(ajouts.niveaux)) {
    if (niveauxUtilises.has(id)) continue;
    delete ajouts.niveaux[id];
    rapport.niveaux = rapport.niveaux.filter((n) => !(n.action === "cree" && table.get(niveauxSource.find((x) => x.nom === n.source)?.id ?? "") === id));
  }

  // Données de projet : seulement cochées ; jamais d'écrasement de la parcelle cible.
  const site: Partial<ModeleAtelier["site"]> = {};
  if (options.site) {
    if (source.site.parcelle && !cible.site.parcelle) site.parcelle = source.site.parcelle;
    else if (source.site.parcelle) rapport.remarques.push("Parcelle : le projet cible a déjà la sienne, elle est conservée.");
    if (source.site.emprise && !cible.site.emprise) site.emprise = source.site.emprise;
  }
  if (options.hypotheses) site.hypotheses = [...cible.site.hypotheses, ...source.site.hypotheses.filter((h) => !cible.site.hypotheses.some((x) => x.id === h.id))];
  if (options.sources) site.sources = [...cible.site.sources, ...source.site.sources.filter((h) => !cible.site.sources.some((x) => x.id === h.id))];
  if (options.structure && source.site.structure) {
    if (cible.site.structure) rapport.remarques.push("Structure déclarée : le projet cible a déjà la sienne, elle est conservée.");
    else site.structure = source.site.structure;
  }
  rapport.parClasse = [...comptes].map(([classe, c]) => ({ classe, ...c })).sort((a, b) => (a.classe < b.classe ? -1 : 1));
  const vide = !Object.values(ajouts).some((t) => Object.keys(t).length) && !Object.keys(site).length;
  if (vide) rapport.remarques.push("Rien à reprendre avec ces choix.");
  return { commande: vide ? null : { type: "modele.reprendre", params: { ajouts, site, origine: rapport.source } }, rapport };
}
