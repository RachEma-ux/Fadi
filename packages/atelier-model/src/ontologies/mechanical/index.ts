/**
 * Ontologie `mechanical` (P2-2, cahier P2 §4 et §5 ; DA-10-01 à 09, 13 à 16 ; DA-06-03 à 06, 09, 10 ; DA-05-17 / 18) :
 * activation par projet, pièces, assemblages, liaisons résolues par le solveur, numérotation, familles, règles,
 * catalogues sourcés. Réducteurs purs, mêmes dans le navigateur et sur le serveur. Une ontologie n'importe jamais une
 * autre ontologie directement : tout passe par le modèle typé (`modele.ts`, `objets.ts`).
 */
import type { Definition, ModeleAtelier, Occurrence, OccurrenceQuelconque, ParamsLiaison, ParamsPieceMecanique, Pose3 } from "../../modele.js";
import { CLASSES, LIBELLES_ONTOLOGIE, ONTOLOGIES_ACTIVABLES, estClasse, estOntologie, ontologiesActives, type Ontologie } from "../../ontologie.js";
import { effetsVides, ErreurCommande, fusionnerEffets, lire, nouveauProbleme, type ContexteCommande, type Reducteur, type ResultatCommande } from "../../commandes/base.js";
import { creerOccurrence, modifierOccurrence, supprimerIds, supprimerOccurrence } from "../../commandes/objets.js";
import { maillageObjet } from "../../projection/maillage.js";
import { validerCatalogueCsv } from "../../catalogues/csv-source.js";
import { developperLiaison, DDL_LIAISON, RANG_LIAISON, TYPES_LIAISON } from "./liaisons.js";
import { changerRepere, empriseMaillage, poseVersRigide, positionsPosees3, rigideVersPose, type RepereAssemblage } from "./geometrie.js";
import { positionsPosees } from "../../solide-exact.js";
import { resoudre, type ContrainteSolveur, type PieceSolveur } from "./solveur.js";
import { controlerRegle, estNomParametre, evaluerFamille, type ParamsFamille, type ParamsRegle } from "./familles.js";

type Brut = Record<string, unknown>;
const brutsDe = (p: Brut): Brut => ((p["params"] as Brut | undefined) ?? p);

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

function lireOntologie(p: Brut): Ontologie {
  const nom = lire.chaine(p, "nom");
  if (!estOntologie(nom)) throw new ErreurCommande("invalide", "nom", `ontologie inconnue : ${nom}`);
  if (!ONTOLOGIES_ACTIVABLES.includes(nom)) throw new ErreurCommande("precondition", "nom", `« ${LIBELLES_ONTOLOGIE[nom]} » fait partie du socle : toujours active`);
  return nom;
}

export const reducteursOntologie: Record<string, Reducteur> = {
  "ontologie.activer": (etat, p) => {
    const nom = lireOntologie(p);
    if (ontologiesActives(etat).includes(nom)) return { etat, effets: effetsVides() };
    return { etat: { ...etat, ontologies: [...(etat.ontologies ?? []), nom] }, effets: effetsVides() };
  },
  "ontologie.desactiver": (etat, p) => {
    const nom = lireOntologie(p);
    if (!(etat.ontologies ?? []).includes(nom)) return { etat, effets: effetsVides() };
    const restants = (Object.values(etat.objets) as OccurrenceQuelconque[]).filter((o) => CLASSES[o.classe].ontologie === nom);
    if (restants.length) throw new ErreurCommande("precondition", "nom", `« ${LIBELLES_ONTOLOGIE[nom]} » : ${restants.length} objet(s) de cette ontologie dans le projet, les supprimer d'abord`);
    const suivant = { ...etat, ontologies: (etat.ontologies ?? []).filter((x) => x !== nom) };
    if (!suivant.ontologies.length) delete (suivant as { ontologies?: Ontologie[] }).ontologies;
    return { etat: suivant, effets: effetsVides() };
  },
};

// ---------------------------------------------------------------------------
// Pièces, assemblages, liaisons
// ---------------------------------------------------------------------------

export const estPiece = (o: OccurrenceQuelconque | undefined): o is Occurrence<"piece-mecanique"> => !!o && o.classe === "piece-mecanique";
export const estAssemblage = (o: OccurrenceQuelconque | undefined): o is Occurrence<"assemblage"> => !!o && o.classe === "assemblage";
export const estLiaison = (o: OccurrenceQuelconque | undefined): o is Occurrence<"liaison"> => !!o && o.classe === "liaison";

export function piecesDe(etat: ModeleAtelier, assemblageId: string): Occurrence<"piece-mecanique">[] {
  return (Object.values(etat.objets) as OccurrenceQuelconque[]).filter((o): o is Occurrence<"piece-mecanique"> => estPiece(o) && o.params.assemblageId === assemblageId).sort((a, b) => (a.id < b.id ? -1 : 1));
}
export function liaisonsDe(etat: ModeleAtelier, assemblageId: string): Occurrence<"liaison">[] {
  const ids = new Set(piecesDe(etat, assemblageId).map((p) => p.id));
  return (Object.values(etat.objets) as OccurrenceQuelconque[]).filter((o): o is Occurrence<"liaison"> => estLiaison(o) && ids.has(o.params.a)).sort((a, b) => (a.id < b.id ? -1 : 1));
}
export function repereAssemblage(etat: ModeleAtelier, assemblageId: string | null): RepereAssemblage | null {
  const a = assemblageId ? etat.objets[assemblageId] : undefined;
  if (!estAssemblage(a)) return null;
  return { position: a.params.position, angleDeg: a.params.angle.value, z: a.params.z };
}

/** Géométrie copiée de la source (R15 : la source garde sa géométrie canonique ; la pièce en porte une copie posée). */
function geometrieSource(etat: ModeleAtelier, sourceId: string): Pick<ParamsPieceMecanique, "brep" | "empreinteBrep" | "moteur" | "versionMoteur" | "maillage" | "volume"> {
  const o = etat.objets[sourceId];
  if (!o) throw new ErreurCommande("precondition", "sourceId", `objet inconnu : ${sourceId}`);
  if (o.classe === "solide-exact") {
    // Pose en plan du solide exact (position, angle) cuite dans le maillage copié : la pièce naît là où le solide est
    // dessiné, comme pour les autres sources ; le brep reste canonique (géométrie, pas pose).
    const positions = positionsPosees(o.params.maillage, o.params.position, o.params.angle.value).map((v) => Math.round(v * 1e9) / 1e9);
    return { brep: o.params.brep, empreinteBrep: o.params.empreinteBrep, moteur: o.params.moteur, versionMoteur: o.params.versionMoteur, maillage: { positions, indices: [...o.params.maillage.indices] }, volume: o.params.volume };
  }
  if (o.classe === "solide" || o.classe === "poteau" || o.classe === "bloc-occurrence" || o.classe === "piece-mecanique") {
    const m = maillageObjet(etat, o);
    if (!m || !m.indices.length) throw new ErreurCommande("precondition", "sourceId", `${sourceId} : aucun volume (hauteur non renseignée ?)`);
    const z = o.niveauId ? (etat.niveaux[o.niveauId]?.elevation ?? 0) : 0;
    const positions = m.positions.map((v, i) => (i % 3 === 2 ? Math.round((v - z) * 1e9) / 1e9 : v));
    const volume = o.classe === "piece-mecanique" ? o.params.volume : null;
    return { brep: o.classe === "piece-mecanique" ? o.params.brep : null, empreinteBrep: o.classe === "piece-mecanique" ? o.params.empreinteBrep : null, moteur: o.classe === "piece-mecanique" ? o.params.moteur : null, versionMoteur: o.classe === "piece-mecanique" ? o.params.versionMoteur : null, maillage: { positions, indices: [...m.indices] }, volume };
  }
  throw new ErreurCommande("precondition", "sourceId", `${sourceId} (${CLASSES[o.classe].libelle}) : une pièce se crée depuis un solide exact, un solide, un poteau ou une pièce`);
}

/** Résout l'assemblage : poses des pièces libres, emprises, diagnostic sur l'assemblage et ses liaisons. */
export function resoudreAssemblage(etat: ModeleAtelier, assemblageId: string): ResultatCommande {
  const asm = etat.objets[assemblageId];
  if (!estAssemblage(asm)) throw new ErreurCommande("precondition", "assemblageId", `assemblage inconnu : ${assemblageId}`);
  const pieces = piecesDe(etat, assemblageId);
  const liaisons = liaisonsDe(etat, assemblageId);
  const effets = effetsVides();
  const objets = { ...etat.objets };
  if (!pieces.length || !liaisons.length) {
    // Sans liaison : rien à résoudre ; le diagnostic de l'assemblage s'efface.
    if (asm.params.diagnostic !== null) { objets[assemblageId] = { ...asm, params: { ...asm.params, diagnostic: null } }; effets.modifies.push(assemblageId); }
    return { etat: { ...etat, objets }, effets };
  }
  // Bâti : les pièces déclarées fixes ; sans aucune, la première (par identifiant) tient lieu de bâti.
  const aucuneFixe = !pieces.some((p) => p.params.fixe);
  const entree: PieceSolveur[] = pieces.map((p, i) => ({ id: p.id, fixe: p.params.fixe || (aucuneFixe && i === 0), pose: poseVersRigide(p.params.pose) }));
  const contraintes: ContrainteSolveur[] = [];
  let equations = 0;
  for (const l of liaisons) {
    if (!pieces.some((p) => p.id === l.params.b)) continue; // liaison vers une pièce d'un autre assemblage : ignorée (signalée à la création)
    contraintes.push(...developperLiaison(l.params));
    equations += RANG_LIAISON[l.params.type];
  }
  const r = resoudre(entree, contraintes, equations);
  const repere = repereAssemblage(etat, assemblageId);
  for (const p of pieces) {
    const pose = rigideVersPose(r.poses[p.id]!);
    const memePose = (Object.keys(pose) as (keyof Pose3)[]).every((k) => Math.abs(pose[k] - p.params.pose[k]) < 1e-12);
    if (memePose && p.params.emprise.length) continue;
    const { emprise } = empriseMaillage(positionsPosees3(p.params.maillage, pose, repere));
    objets[p.id] = { ...p, params: { ...p.params, pose, emprise } };
    effets.modifies.push(p.id);
  }
  for (const l of liaisons) if (l.params.etat !== r.diagnostic) { objets[l.id] = { ...l, params: { ...l.params, etat: r.diagnostic } }; effets.modifies.push(l.id); }
  if (asm.params.diagnostic !== r.diagnostic) { objets[assemblageId] = { ...asm, params: { ...asm.params, diagnostic: r.diagnostic } }; effets.modifies.push(assemblageId); }
  if (asm.niveauId) effets.niveauxTouches.push(asm.niveauId);
  if (r.diagnostic === "sur-contraint incompatible" || r.diagnostic === "non convergé") throw new ErreurCommande("precondition", "liaisons", `assemblage ${asm.params.nom} : ${r.diagnostic} (${r.equations} équation(s), rang ${r.rang}, ${r.inconnues} inconnue(s)) — la liaison n'est pas écrite`);
  return { etat: { ...etat, objets }, effets };
}

/** Recalcule les emprises des pièces d'un assemblage dont le repère a changé. */
function reposerPieces(etat: ModeleAtelier, assemblageId: string): ResultatCommande {
  const repere = repereAssemblage(etat, assemblageId);
  const objets = { ...etat.objets };
  const effets = effetsVides();
  for (const p of piecesDe(etat, assemblageId)) {
    const { emprise } = empriseMaillage(positionsPosees3(p.params.maillage, p.params.pose, repere));
    objets[p.id] = { ...p, params: { ...p.params, emprise } };
    effets.modifies.push(p.id);
  }
  return { etat: { ...etat, objets }, effets };
}

const enchainer = (a: ResultatCommande, f: (etat: ModeleAtelier) => ResultatCommande): ResultatCommande => {
  const b = f(a.etat);
  return { etat: b.etat, effets: fusionnerEffets(a.effets, b.effets) };
};

export const reducteursMecanique: Record<string, Reducteur> = {
  ...reducteursOntologie,
  /** Pièce depuis une source (solide exact, solide, poteau, pièce) ; posée dans un assemblage si `assemblageId`. */
  "pieceMecanique.creer": (etat, p, ctx) => {
    const b = brutsDe(p);
    const sourceId = lire.chaine(b, "sourceId");
    const geo = geometrieSource(etat, sourceId);
    const assemblageId = lire.chaineOuNull(b, "assemblageId");
    const asm = assemblageId ? etat.objets[assemblageId] : undefined;
    if (assemblageId && !estAssemblage(asm)) throw new ErreurCommande("precondition", "assemblageId", `assemblage inconnu : ${assemblageId}`);
    const niveauId = estAssemblage(asm) ? asm.niveauId : (lire.chaineOuNull(p, "niveauId") ?? etat.objets[sourceId]?.niveauId ?? null);
    const params = { ...b, ...geo, sourceId, assemblageId, nom: lire.chaineOuNull(b, "nom") ?? ((etat.objets[sourceId]!.params as unknown as Brut)["nom"] as string | null) ?? sourceId };
    const r = creerOccurrence(etat, { ...p, niveauId, params }, ctx, "piece-mecanique");
    return assemblageId ? enchainer(r, (e) => resoudreAssemblage(e, assemblageId)) : r;
  },
  "pieceMecanique.modifier": (etat, p, ctx) => {
    const r = modifierOccurrence(etat, p, ctx, "piece-mecanique");
    const o = r.etat.objets[lire.chaine(p, "id")] as Occurrence<"piece-mecanique">;
    return o.params.assemblageId ? enchainer(r, (e) => resoudreAssemblage(e, o.params.assemblageId!)) : r;
  },
  "pieceMecanique.supprimer": (etat, p, ctx) => {
    const id = lire.objet(etat, p, "id");
    const o = etat.objets[id];
    if (!estPiece(o)) throw new ErreurCommande("precondition", "id", `${id} n'est pas une pièce mécanique`);
    const liaisons = (Object.values(etat.objets) as OccurrenceQuelconque[]).filter((x) => estLiaison(x) && (x.params.a === id || x.params.b === id)).map((x) => x.id);
    const r = supprimerIds(etat, [id, ...liaisons], ctx);
    return o.params.assemblageId && r.etat.objets[o.params.assemblageId] ? enchainer(r, (e) => resoudreAssemblage(e, o.params.assemblageId!)) : r;
  },
  "assemblage.creer": (etat, p, ctx) => {
    const b = brutsDe(p);
    const r = creerOccurrence(etat, { ...p, params: { ...b, diagnostic: null } }, ctx, "assemblage");
    const id = r.effets.crees[0]!;
    const pieces = b["pieces"];
    if (pieces === undefined || pieces === null) return r;
    if (!Array.isArray(pieces) || !pieces.every((x) => typeof x === "string")) throw new ErreurCommande("invalide", "pieces", "« pieces » : liste d'identifiants de pièces");
    return enchainer(r, (e) => rattacherPieces(e, id, pieces as string[], ctx));
  },
  "assemblage.modifier": (etat, p, ctx) => {
    const r = modifierOccurrence(etat, p, ctx, "assemblage");
    return enchainer(r, (e) => reposerPieces(e, lire.chaine(p, "id")));
  },
  "assemblage.supprimer": (etat, p, ctx) => {
    const id = lire.objet(etat, p, "id");
    const pieces = piecesDe(etat, id);
    if (pieces.length && !lire.booleen(p, "avecPieces", false)) throw new ErreurCommande("precondition", "id", `l'assemblage ${id} contient ${pieces.length} pièce(s) : indiquer avecPieces = true pour les supprimer avec lui`);
    const liaisons = liaisonsDe(etat, id).map((l) => l.id);
    return supprimerOccurrence(etat, { id }, ctx, "assemblage") && supprimerIds(etat, [id, ...pieces.map((x) => x.id), ...liaisons], ctx);
  },
  /** Rattacher des pièces à un assemblage (elles passent sur son niveau, pose conservée) puis résoudre. */
  "assemblage.rattacher": (etat, p, ctx) => {
    const id = lire.objet(etat, p, "id");
    const pieces = p["pieces"];
    if (!Array.isArray(pieces) || !pieces.every((x) => typeof x === "string") || !pieces.length) throw new ErreurCommande("invalide", "pieces", "« pieces » : liste d'identifiants de pièces");
    return rattacherPieces(etat, id, pieces as string[], ctx);
  },
  /** Numérotation (DA-10-14 / 15) : numéros 1..n par identifiant, référence « préfixe-numéro » là où elle manque. */
  "assemblage.numeroter": (etat, p) => {
    const id = lire.objet(etat, p, "id");
    const asm = etat.objets[id];
    if (!estAssemblage(asm)) throw new ErreurCommande("precondition", "id", `${id} n'est pas un assemblage`);
    const prefixe = (lire.chaineOuNull(p, "prefixe") ?? asm.params.numero ?? asm.params.nom).trim();
    const objets = { ...etat.objets };
    const effets = effetsVides();
    piecesDe(etat, id).forEach((pc, i) => {
      const numero = i + 1;
      const reference = pc.params.reference ?? `${prefixe}-${String(numero).padStart(2, "0")}`;
      if (pc.params.numero === numero && pc.params.reference === reference) return;
      objets[pc.id] = { ...pc, params: { ...pc.params, numero, reference } };
      effets.modifies.push(pc.id);
    });
    return { etat: { ...etat, objets }, effets };
  },
  "liaison.creer": (etat, p, ctx) => {
    const b = brutsDe(p);
    const r = creerOccurrence(etat, { ...p, niveauId: null, params: { ...b, etat: null } }, ctx, "liaison");
    const l = r.etat.objets[r.effets.crees[0]!] as Occurrence<"liaison">;
    const asmId = (etat.objets[l.params.a] as Occurrence<"piece-mecanique">).params.assemblageId!;
    return enchainer(r, (e) => resoudreAssemblage(e, asmId));
  },
  "liaison.modifier": (etat, p, ctx) => {
    const r = modifierOccurrence(etat, p, ctx, "liaison");
    const l = r.etat.objets[lire.chaine(p, "id")] as Occurrence<"liaison">;
    return enchainer(r, (e) => resoudreAssemblage(e, (e.objets[l.params.a] as Occurrence<"piece-mecanique">).params.assemblageId!));
  },
  /** Pilotage (DA-10-09) : nouvelle valeur d'angle ou de course, puis résolution. */
  "liaison.piloter": (etat, p, ctx) => {
    const id = lire.objet(etat, p, "id");
    const valeur = lire.nombre(p, "valeur")!;
    const r = modifierOccurrence(etat, { id, params: { valeur } }, ctx, "liaison");
    const l = r.etat.objets[id] as Occurrence<"liaison">;
    return enchainer(r, (e) => resoudreAssemblage(e, (e.objets[l.params.a] as Occurrence<"piece-mecanique">).params.assemblageId!));
  },
  "liaison.supprimer": (etat, p, ctx) => {
    const id = lire.objet(etat, p, "id");
    const l = etat.objets[id];
    if (!estLiaison(l)) throw new ErreurCommande("precondition", "id", `${id} n'est pas une liaison`);
    const asmId = (etat.objets[l.params.a] as Occurrence<"piece-mecanique"> | undefined)?.params.assemblageId ?? null;
    const r = supprimerIds(etat, [id], ctx);
    return asmId ? enchainer(r, (e) => resoudreAssemblage(e, asmId)) : r;
  },
  // Familles, configurations, règles (DA-06-03 à 06, 09, 10) : définitions du catalogue du projet.
  "famille.definir": (etat, p, ctx) => {
    const id = lire.chaineOuNull(p, "id") ?? ctx.ids.nouveau("famille");
    const existante = etat.definitions[id];
    if (existante && existante.classe !== "famille") throw new ErreurCommande("precondition", "id", `${id} n'est pas une famille`);
    const nom = lire.chaine(p, "nom").trim();
    if (!nom) throw new ErreurCommande("invalide", "nom", "nom requis");
    const brut = p["parametres"];
    if (!brut || typeof brut !== "object" || Array.isArray(brut)) throw new ErreurCommande("invalide", "parametres", "« parametres » : { nom: { expression, unite } }");
    const parametres: ParamsFamille["parametres"] = {};
    for (const [n, v] of Object.entries(brut as Brut)) {
      if (!estNomParametre(n)) throw new ErreurCommande("invalide", `parametres.${n}`, "nom de paramètre invalide (lettres, chiffres, _)");
      const q = (v ?? {}) as { expression?: unknown; unite?: unknown };
      if (typeof q.expression !== "string" || !q.expression.trim()) throw new ErreurCommande("invalide", `parametres.${n}.expression`, "expression requise");
      parametres[n] = { expression: q.expression.trim(), unite: typeof q.unite === "string" && q.unite.trim() ? q.unite.trim() : null };
    }
    const confBrut = p["configurations"] ?? {};
    if (typeof confBrut !== "object" || Array.isArray(confBrut)) throw new ErreurCommande("invalide", "configurations", "« configurations » : { nom: { parametre: valeur } }");
    const configurations: ParamsFamille["configurations"] = {};
    for (const [c, vals] of Object.entries(confBrut as Brut)) {
      if (!vals || typeof vals !== "object") throw new ErreurCommande("invalide", `configurations.${c}`, "valeurs attendues");
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(vals as Brut)) {
        if (!(k in parametres)) throw new ErreurCommande("invalide", `configurations.${c}.${k}`, `paramètre inconnu : ${k}`);
        if (typeof v !== "number" || !Number.isFinite(v)) throw new ErreurCommande("invalide", `configurations.${c}.${k}`, "nombre attendu");
        out[k] = v;
      }
      configurations[c] = out;
    }
    const active = lire.chaineOuNull(p, "active");
    if (active !== null && !(active in configurations)) throw new ErreurCommande("precondition", "active", `configuration inconnue : ${active}`);
    const params: ParamsFamille = { parametres, configurations, active };
    try { evaluerFamille(params, null); for (const c of Object.keys(configurations)) evaluerFamille(params, c); } catch (e) { throw new ErreurCommande("invalide", "parametres", e instanceof Error ? e.message : String(e)); }
    const def: Definition = { id, classe: "famille", nom, params: params as unknown as Record<string, unknown>, version: (existante?.version ?? 0) + 1 };
    const effets = effetsVides();
    (existante ? effets.modifies : effets.crees).push(id);
    return { etat: { ...etat, definitions: { ...etat.definitions, [id]: def } }, effets };
  },
  "famille.configurer": (etat, p) => {
    const id = lire.chaine(p, "id");
    const d = etat.definitions[id];
    if (!d || d.classe !== ("famille")) throw new ErreurCommande("precondition", "id", `famille inconnue : ${id}`);
    const f = d.params as unknown as ParamsFamille;
    const active = lire.chaineOuNull(p, "active");
    if (active !== null && !(active in f.configurations)) throw new ErreurCommande("precondition", "active", `configuration inconnue : ${active}`);
    const effets = effetsVides();
    effets.modifies.push(id);
    return { etat: { ...etat, definitions: { ...etat.definitions, [id]: { ...d, params: { ...f, active } as unknown as Record<string, unknown>, version: d.version + 1 } } }, effets };
  },
  "regle.definir": (etat, p, ctx) => {
    const id = lire.chaineOuNull(p, "id") ?? ctx.ids.nouveau("regle");
    const existante = etat.definitions[id];
    const nom = lire.chaine(p, "nom").trim();
    const expression = lire.chaine(p, "expression").trim();
    const message = lire.chaine(p, "message").trim();
    const familleId = lire.chaineOuNull(p, "familleId");
    if (familleId && etat.definitions[familleId]?.classe !== ("famille")) throw new ErreurCommande("precondition", "familleId", `famille inconnue : ${familleId}`);
    if (!/(<=|>=|=|<|>)/.test(expression)) throw new ErreurCommande("invalide", "expression", "comparaison attendue (<=, >=, <, >, =)");
    // Règle par ontologie (P2-8, DA-19-05) : classe du socle ou d'une ontologie active ; contrôlée sur chaque occurrence.
    const classe = lire.chaineOuNull(p, "classe");
    if (classe !== null) {
      if (familleId) throw new ErreurCommande("invalide", "classe", "une règle porte sur une famille ou sur une classe, pas les deux");
      if (!estClasse(classe)) throw new ErreurCommande("invalide", "classe", `classe inconnue : ${classe}`);
      if (!ontologiesActives(etat).includes(CLASSES[classe].ontologie)) throw new ErreurCommande("precondition", "classe", `${CLASSES[classe].libelle} : ontologie « ${LIBELLES_ONTOLOGIE[CLASSES[classe].ontologie]} » non activée dans ce projet (ontologie.activer)`);
    }
    const params: ParamsRegle = { expression, message, familleId, classe };
    const def: Definition = { id, classe: "regle", nom, params: params as unknown as Record<string, unknown>, version: (existante?.version ?? 0) + 1 };
    const effets = effetsVides();
    (existante ? effets.modifies : effets.crees).push(id);
    return { etat: { ...etat, definitions: { ...etat.definitions, [id]: def } }, effets };
  },
  /** Contrôle des règles sur les valeurs évaluées de leur famille : un problème « regle » par règle violée (jamais corrigé). */
  "regles.controler": (etat, _p, ctx) => {
    const problemes = Object.fromEntries(Object.entries(etat.problemes).filter(([, pb]) => pb.type !== "regle" || pb.objetId !== null || pb.message.includes("non évalué")));
    const effets = effetsVides();
    for (const d of Object.values(etat.definitions).filter((x) => x.classe === ("regle") && !(x.params as unknown as ParamsRegle).classe).sort((a, b) => (a.id < b.id ? -1 : 1))) {
      const r = d.params as unknown as ParamsRegle;
      const fam = r.familleId ? (etat.definitions[r.familleId]?.params as unknown as ParamsFamille | undefined) : undefined;
      let message: string | null;
      try { message = controlerRegle(r, fam ? evaluerFamille(fam) : {}); } catch (e) { message = `règle « ${d.nom} » non évaluable : ${e instanceof Error ? e.message : String(e)}`; }
      if (message) { const pb = nouveauProbleme(ctx.ids, "regle", null, `${d.nom} : ${message}`); problemes[pb.id] = pb; effets.problemes.push(pb); }
    }
    return { etat: { ...etat, problemes }, effets };
  },
  /** Catalogue sourcé (D-180, DA-05-17 / 18) : texte CSV validé ligne par ligne ; rien n'est importé si une ligne est refusée. */
  "catalogue.importer": (etat, p, ctx) => {
    const nom = lire.chaine(p, "nom").trim();
    const texte = lire.chaine(p, "csv");
    const ontologie = lire.chaineOuNull(p, "ontologie");
    let rapport;
    try { rapport = validerCatalogueCsv(texte); } catch (e) { throw new ErreurCommande("invalide", "csv", e instanceof Error ? e.message : String(e)); }
    if (!rapport.importable) throw new ErreurCommande("invalide", "csv", `catalogue refusé : ${rapport.refus.map((r) => `ligne ${r.ligne} (${r.motif})`).join(" ; ")}`);
    const id = lire.chaineOuNull(p, "id") ?? ctx.ids.nouveau("catalogue");
    const existant = etat.definitions[id];
    const def: Definition = { id, classe: "catalogue", nom, params: { ontologie, colonnes: rapport.colonnes, lignes: rapport.retenues }, version: (existant?.version ?? 0) + 1 };
    const effets = effetsVides();
    (existant ? effets.modifies : effets.crees).push(id);
    return { etat: { ...etat, definitions: { ...etat.definitions, [id]: def } }, effets };
  },
};

function rattacherPieces(etat: ModeleAtelier, assemblageId: string, pieces: readonly string[], _ctx: ContexteCommande): ResultatCommande {
  const asm = etat.objets[assemblageId];
  if (!estAssemblage(asm)) throw new ErreurCommande("precondition", "id", `assemblage inconnu : ${assemblageId}`);
  const objets = { ...etat.objets };
  const effets = effetsVides();
  const vers = repereAssemblage(etat, assemblageId);
  for (const id of pieces) {
    const o = objets[id];
    if (!estPiece(o)) throw new ErreurCommande("precondition", "pieces", `${id} n'est pas une pièce mécanique`);
    // La pièce reste où elle est dans le niveau : sa pose est réexprimée dans le repère du nouvel assemblage.
    const de = o.params.assemblageId === assemblageId ? vers : repereAssemblage(etat, o.params.assemblageId);
    const pose = o.params.assemblageId === assemblageId ? o.params.pose : changerRepere(o.params.pose, de, vers);
    objets[id] = { ...o, niveauId: asm.niveauId, params: { ...o.params, assemblageId, pose } };
    effets.modifies.push(id);
  }
  return enchainer({ etat: { ...etat, objets }, effets }, (e) => resoudreAssemblage(e, assemblageId));
}

/**
 * Contrôle après commande : un assemblage dont le repère a changé (déplacé, tourné par une transformation générique)
 * repose ses pièces ; les liaisons dont une pièce a disparu ou changé d'assemblage sont signalées comme problèmes.
 */
export function controlerLiaisons(avant: ModeleAtelier, etat: ModeleAtelier, ctx: ContexteCommande): ResultatCommande {
  let effets = effetsVides();
  for (const a of Object.values(etat.objets) as OccurrenceQuelconque[]) {
    if (!estAssemblage(a)) continue;
    const prec = avant.objets[a.id];
    if (!prec || !estAssemblage(prec)) continue;
    const q = prec.params, r = a.params;
    if (q.position.x === r.position.x && q.position.y === r.position.y && q.angle.value === r.angle.value && q.z === r.z) continue;
    const rp = reposerPieces(etat, a.id);
    etat = rp.etat;
    effets = fusionnerEffets(effets, rp.effets);
  }
  let problemes = etat.problemes;
  for (const l of Object.values(etat.objets) as OccurrenceQuelconque[]) {
    if (!estLiaison(l)) continue;
    const a = etat.objets[l.params.a], b = etat.objets[l.params.b];
    const anciens = Object.entries(problemes).filter(([, pb]) => pb.objetId === l.id && pb.type === "reference-a-reparer");
    if (estPiece(a) && estPiece(b) && a.params.assemblageId === b.params.assemblageId) {
      // Liaison redevenue valide (pièce revenue dans l'assemblage, références réparées) : le problème s'efface.
      if (anciens.length) { problemes = Object.fromEntries(Object.entries(problemes).filter(([k]) => !anciens.some(([id]) => id === k))); }
      continue;
    }
    if (anciens.length) continue;
    const pb = nouveauProbleme(ctx.ids, "reference-a-reparer", l.id, `liaison ${l.id} : ${!estPiece(a) || !estPiece(b) ? "une pièce a disparu" : "pièces de deux assemblages différents"} — à réparer`);
    problemes = { ...problemes, [pb.id]: pb };
    effets.problemes.push(pb);
  }
  return { etat: problemes === etat.problemes ? etat : { ...etat, problemes }, effets };
}

export { TYPES_LIAISON, DDL_LIAISON };
export type { ParamsLiaison };
