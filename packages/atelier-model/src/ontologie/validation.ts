/**
 * Validation d'un objet contre l'ontologie (à l'exécution : données JSON, commandes reçues, import).
 *
 * Contrôles : classe connue ; ontologie de la classe ; provenance et statut obligatoires (objet, propriétés,
 * annotations) ; paramètres obligatoires présents ; unités ; signes ; repères (toute coordonnée taguée, un
 * seul repère par paramètre, et repère local du projet sauf paramètre déclaré `repereLocalLibre`) ; niveau.
 * Ne contrôle pas l'existence des objets cités (niveau, mur hôte, calque) : c'est une précondition de
 * réducteur, qui connaît l'état.
 */
import { estClasseObjet, MOTIF_COULEUR } from "./classes.js";
import { descripteur, type DeclarationParametre } from "./descripteurs.js";
import { controlerTracabilite, estNonEvaluee } from "./provenance.js";
import { controlerPropriete, type Propriete } from "./proprietes.js";
import { controlerRepereUnique, estPointCadastral, estPointLocal, REPERE_LOCAL_PROJET } from "./reperes.js";
import { controlerGrandeur, estGrandeur, type Unite } from "./unites.js";

export interface ErreurValidation {
  /** Chemin JSON de la valeur fautive (ex. `params.epaisseur`). */
  readonly chemin: string;
  readonly message: string;
}

const estObjet = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const estTexte = (x: unknown): x is string => typeof x === "string";
const estIdentifiant = (x: unknown): x is string => typeof x === "string" && x.trim().length > 0;

function controlerPoints(points: unknown, chemin: string, libre: boolean, min: number, erreurs: ErreurValidation[]): void {
  if (!Array.isArray(points)) {
    erreurs.push({ chemin, message: "liste de points attendue" });
    return;
  }
  if (points.length < min) erreurs.push({ chemin, message: `au moins ${min} point(s) attendu(s)` });
  points.forEach((pt, i) => {
    if (!estPointLocal(pt)) erreurs.push({ chemin: `${chemin}[${i}]`, message: "coordonnée locale `{ x, y, frame: \"local\", unit: \"m\" }` attendue" });
  });
  const r = controlerRepereUnique(points);
  if (!r.ok) erreurs.push({ chemin, message: r.message });
  else if (!libre && r.cle !== null && r.cle !== `local:${REPERE_LOCAL_PROJET}`) {
    erreurs.push({ chemin, message: `repère « ${r.cle} » refusé : repère local du projet attendu` });
  }
}

function sommetsPolygoneAvecTrous(x: unknown, chemin: string, erreurs: ErreurValidation[]): unknown[] | null {
  if (!estObjet(x) || !Array.isArray(x.contour) || !Array.isArray(x.trous)) {
    erreurs.push({ chemin, message: "polygone `{ contour, trous }` attendu" });
    return null;
  }
  const sommets: unknown[] = [...x.contour];
  x.trous.forEach((t, i) => {
    if (!estObjet(t) || !Array.isArray(t.polygone)) erreurs.push({ chemin: `${chemin}.trous[${i}]`, message: "trou `{ polygone }` attendu" });
    else sommets.push(...t.polygone);
  });
  return sommets;
}

function controlerParametre(decl: DeclarationParametre, v: unknown, chemin: string, erreurs: ErreurValidation[]): void {
  if (decl.evaluable === true && estNonEvaluee(v)) {
    if (typeof v.motif !== "string" || v.motif.trim() === "") erreurs.push({ chemin, message: "« non évaluée » sans motif" });
    return;
  }
  const libre = decl.repereLocalLibre === true;
  const longueurSignee = (x: unknown, unite: Unite) => {
    const e = controlerGrandeur(x, unite);
    if (e) return erreurs.push({ chemin, message: e });
    const val = (x as { value: number }).value;
    if (decl.signe === ">0" && !(val > 0)) erreurs.push({ chemin, message: "valeur strictement positive attendue" });
    if (decl.signe === ">=0" && !(val >= 0)) erreurs.push({ chemin, message: "valeur positive ou nulle attendue" });
    return undefined;
  };
  switch (decl.nature) {
    case "longueur":
      longueurSignee(v, "m");
      return;
    case "aire":
      longueurSignee(v, "m²");
      return;
    case "angle":
      longueurSignee(v, "°");
      return;
    case "evaluable-longueur":
      if (!estNonEvaluee(v)) longueurSignee(v, "m");
      return;
    case "evaluable-angle":
      if (!estNonEvaluee(v)) longueurSignee(v, "°");
      return;
    case "evaluable-entier":
      if (!estNonEvaluee(v) && !(Number.isInteger(v) && (v as number) >= 0)) erreurs.push({ chemin, message: "entier ≥ 0 ou « non évaluée » attendu" });
      return;
    case "reel":
      if (typeof v !== "number" || !Number.isFinite(v)) erreurs.push({ chemin, message: "nombre fini attendu" });
      return;
    case "entier":
      if (!Number.isInteger(v) || (v as number) < 0) erreurs.push({ chemin, message: "entier ≥ 0 attendu" });
      return;
    case "fraction":
      if (typeof v !== "number" || !(v >= 0 && v <= 1)) erreurs.push({ chemin, message: "nombre dans [0, 1] attendu" });
      return;
    case "texte":
      if (!estTexte(v)) erreurs.push({ chemin, message: "texte attendu" });
      return;
    case "booleen":
      if (typeof v !== "boolean") erreurs.push({ chemin, message: "booléen attendu" });
      return;
    case "identifiant":
      if (!estIdentifiant(v)) erreurs.push({ chemin, message: "identifiant non vide attendu" });
      return;
    case "enum":
      if (!estTexte(v) || !(decl.valeurs ?? []).includes(v)) erreurs.push({ chemin, message: `valeur attendue parmi ${(decl.valeurs ?? []).join(", ")}` });
      return;
    case "couleur":
      if (!estTexte(v) || !MOTIF_COULEUR.test(v)) erreurs.push({ chemin, message: "couleur `#rrggbb` attendue" });
      return;
    case "point-local":
      controlerPoints([v], chemin, libre, 1, erreurs);
      return;
    case "segment-local":
      if (!estObjet(v)) erreurs.push({ chemin, message: "segment `{ a, b }` attendu" });
      else controlerPoints([v.a, v.b], chemin, libre, 2, erreurs);
      return;
    case "liste-points-local":
      controlerPoints(v, chemin, libre, 2, erreurs);
      return;
    case "polygone-local":
      controlerPoints(v, chemin, libre, 3, erreurs);
      return;
    case "trous-local":
      if (!Array.isArray(v)) erreurs.push({ chemin, message: "liste de trous attendue" });
      else
        v.forEach((t, i) => {
          if (!estObjet(t) || !Array.isArray(t.polygone)) erreurs.push({ chemin: `${chemin}[${i}]`, message: "trou `{ polygone }` attendu" });
          else controlerPoints(t.polygone, `${chemin}[${i}].polygone`, libre, 3, erreurs);
        });
      return;
    case "polygone-avec-trous-local": {
      const s = sommetsPolygoneAvecTrous(v, chemin, erreurs);
      if (s) controlerPoints(s, chemin, libre, 3, erreurs);
      return;
    }
    case "polygones-avec-trous-local":
      if (!Array.isArray(v)) erreurs.push({ chemin, message: "liste de polygones attendue" });
      else {
        const tous: unknown[] = [];
        v.forEach((poly, i) => {
          const s = sommetsPolygoneAvecTrous(poly, `${chemin}[${i}]`, erreurs);
          if (s) {
            controlerPoints(s, `${chemin}[${i}]`, libre, 3, erreurs);
            tous.push(...s);
          }
        });
        const r = controlerRepereUnique(tous);
        if (!r.ok) erreurs.push({ chemin, message: r.message });
      }
      return;
    case "polygone-cadastral":
      if (!Array.isArray(v) || v.length < 3) erreurs.push({ chemin, message: "au moins 3 sommets cadastraux attendus" });
      else {
        v.forEach((pt, i) => {
          if (!estPointCadastral(pt)) erreurs.push({ chemin: `${chemin}[${i}]`, message: "coordonnée `{ x, y, frame: \"cadastral\", unit: \"m\", crs }` attendue" });
        });
        const r = controlerRepereUnique(v);
        if (!r.ok) erreurs.push({ chemin, message: r.message });
      }
      return;
    case "position-baie":
      if (!estObjet(v) || typeof v.t !== "number" || !(v.t >= 0 && v.t <= 1)) erreurs.push({ chemin, message: "position `{ t ∈ [0, 1] }` attendue" });
      else if (v.distance !== undefined) {
        const e = controlerGrandeur(v.distance, "m");
        if (e) erreurs.push({ chemin: `${chemin}.distance`, message: e });
      }
      return;
    case "liste-identifiants":
      if (!Array.isArray(v) || !v.every(estIdentifiant)) erreurs.push({ chemin, message: "liste d'identifiants attendue" });
      return;
    case "liste-charges":
      if (!Array.isArray(v) || !v.every((c) => estGrandeur(c, "kg/m²") || estGrandeur(c, "kN/m²"))) erreurs.push({ chemin, message: "liste de charges en kg/m² ou kN/m² attendue" });
      return;
    case "references-extremites":
      if (!Array.isArray(v)) erreurs.push({ chemin, message: "liste de références attendue" });
      else
        v.forEach((r, i) => {
          if (!estObjet(r) || (r.extremite !== "a" && r.extremite !== "b") || !estIdentifiant(r.objetId) || !estIdentifiant(r.caracteristique)) {
            erreurs.push({ chemin: `${chemin}[${i}]`, message: "référence `{ extremite, objetId, caracteristique }` attendue" });
          }
        });
      return;
    case "valeur-simple":
      if (!(estTexte(v) || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)))) erreurs.push({ chemin, message: "texte, nombre ou booléen attendu" });
      return;
  }
}

function controlerProprietes(x: unknown, erreurs: ErreurValidation[]): void {
  if (!Array.isArray(x)) {
    erreurs.push({ chemin: "proprietes", message: "liste de propriétés attendue (vide permise)" });
    return;
  }
  x.forEach((prop, i) => {
    for (const m of controlerTracabilite(prop)) erreurs.push({ chemin: `proprietes[${i}]`, message: m });
    if (estObjet(prop)) for (const m of controlerPropriete(prop as unknown as Propriete)) erreurs.push({ chemin: `proprietes[${i}]`, message: m });
  });
}

/** Valide un objet ; liste vide = conforme. */
export function validerObjet(objet: unknown): ErreurValidation[] {
  const erreurs: ErreurValidation[] = [];
  if (!estObjet(objet)) return [{ chemin: "", message: "objet attendu" }];
  if (!estIdentifiant(objet.id)) erreurs.push({ chemin: "id", message: "identifiant non vide attendu" });
  if (!estClasseObjet(objet.classe)) {
    erreurs.push({ chemin: "classe", message: `classe inconnue « ${String(objet.classe)} »` });
    return erreurs;
  }
  const d = descripteur(objet.classe);
  if (objet.ontologie !== d.ontologie) erreurs.push({ chemin: "ontologie", message: `ontologie « ${d.ontologie} » attendue pour ${objet.classe}` });
  for (const m of controlerTracabilite(objet)) erreurs.push({ chemin: "", message: m });
  if (d.porteNiveau && !estIdentifiant(objet.niveauId)) erreurs.push({ chemin: "niveauId", message: `niveau obligatoire pour ${objet.classe}` });
  if (!d.porteNiveau && objet.niveauId !== undefined) erreurs.push({ chemin: "niveauId", message: `${objet.classe} est un objet de projet, sans niveau` });
  if (objet.calqueId !== undefined && (!d.admetCalque || !estIdentifiant(objet.calqueId))) erreurs.push({ chemin: "calqueId", message: `calque non admis ou vide pour ${objet.classe}` });
  if (objet.definitionId !== undefined && !d.admetType) erreurs.push({ chemin: "definitionId", message: `${objet.classe} n'admet pas de définition de type` });
  controlerProprietes(objet.proprietes, erreurs);
  if (objet.annotations !== undefined) {
    if (!estObjet(objet.annotations)) erreurs.push({ chemin: "annotations", message: "objet attendu" });
    else
      for (const [nom, t] of Object.entries(objet.annotations)) {
        for (const m of controlerTracabilite(t)) erreurs.push({ chemin: `annotations.${nom}`, message: m });
      }
  }
  const params = objet.params;
  if (!estObjet(params)) {
    erreurs.push({ chemin: "params", message: "paramètres attendus" });
    return erreurs;
  }
  const connus = new Set(d.parametres.map((x) => x.nom));
  for (const cle of Object.keys(params)) if (!connus.has(cle)) erreurs.push({ chemin: `params.${cle}`, message: `paramètre inconnu pour ${objet.classe}` });
  for (const decl of d.parametres) {
    const v = params[decl.nom];
    if (v === undefined) {
      if (decl.obligatoire) erreurs.push({ chemin: `params.${decl.nom}`, message: "paramètre obligatoire absent (une valeur absente est « non évaluée », jamais devinée)" });
      continue;
    }
    controlerParametre(decl, v, `params.${decl.nom}`, erreurs);
  }
  for (const groupe of d.unDe ?? []) {
    if (!groupe.some((n) => params[n] !== undefined)) erreurs.push({ chemin: "params", message: `l'un de ${groupe.join(" / ")} est obligatoire` });
  }
  return erreurs;
}
