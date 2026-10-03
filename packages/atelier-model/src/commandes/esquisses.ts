/**
 * Esquisse (annexe B, DA-01-02 à DA-01-11) : `esquisse.ligne`, `.polyligne`, `.arc`, `.cercle`, `.rectangle`,
 * `.polygone`, `.spline`, `.construction`, `.hachure`, `esquisse.modifier`, `esquisse.supprimer`.
 * Contrôles propres : longueur ≥ `longueurMin`, sommets consécutifs distincts, arc non nul, polygone ≥ 3 côtés,
 * spline de degré ≥ 1 avec assez de points, cohérence `nature` / champs d'une ligne de construction.
 * Une esquisse auto-sécante est acceptée (DA-01-02).
 */
import { CLASSES_ESQUISSE, type ClasseEsquisse, type ObjetModele } from "../ontologie/classes.js";
import { estPointLocal } from "../ontologie/reperes.js";
import { controlerContour, controlerLongueurMin, controlerTrous, exigerCibles, fabriqueCreation, fabriqueSuppression, fusionnerModifications, nomObjet, type ControleObjet, type Corps } from "./communs.js";
import { sommetsConfondus } from "./geometrie.js";
import { motif } from "./transaction.js";

const touche = (cles: readonly string[] | null, ...k: string[]) => cles === null || k.some((x) => cles.includes(x));

export const controleEsquisse: ControleObjet = (tx, o, chemin, cles) => {
  const objet = nomObjet(o);
  const refuser = (cle: string, cause: string, action: string) => tx.refuser("parametre-invalide", `${chemin}.${cle}`, motif(objet, cause, action), [o.id]);
  switch (o.classe) {
    case "esquisse.ligne":
      if (touche(cles, "a", "b")) controlerLongueurMin(tx, o.params.a, o.params.b, `${chemin}.b`, objet);
      return;
    case "esquisse.polyligne":
    case "esquisse.spline": {
      const pts = o.params.points;
      if (touche(cles, "points", "ferme") && Array.isArray(pts) && pts.every(estPointLocal)) {
        const i = sommetsConfondus(pts, o.params.ferme === true);
        if (i !== null) refuser(`points[${i}]`, `sommets ${i} et ${(i + 1) % pts.length} confondus`, "supprimer le sommet en double");
      }
      if (o.classe === "esquisse.spline" && touche(cles, "degre", "points", "mode")) {
        const d = o.params.degre;
        if (!(Number.isInteger(d) && d >= 1)) refuser("degre", `degré ${String(d)} invalide`, "donner un entier ≥ 1");
        else if (o.params.mode === "controle" && Array.isArray(pts) && pts.length < d + 1) refuser("points", `${pts.length} points de contrôle pour un degré ${d}`, `fournir au moins ${d + 1} points`);
      }
      return;
    }
    case "esquisse.arc":
      if (touche(cles, "angleDebut", "angleFin") && o.params.angleDebut?.value === o.params.angleFin?.value) refuser("angleFin", "angle de début égal à l'angle de fin (arc nul)", "choisir deux angles distincts ou tracer un cercle");
      return;
    case "esquisse.polygone":
      if (touche(cles, "nombreCotes") && !(Number.isInteger(o.params.nombreCotes) && o.params.nombreCotes >= 3)) refuser("nombreCotes", `${String(o.params.nombreCotes)} côté(s)`, "donner un entier ≥ 3");
      return;
    case "esquisse.construction": {
      const p = o.params as unknown as Record<string, unknown>;
      const presents = (ks: string[]) => ks.filter((k) => p[k] !== undefined);
      if (p.nature === "axe") {
        if (p.a === undefined || p.b === undefined) refuser("a", "un axe exige deux points a et b", "fournir a et b");
        else controlerLongueurMin(tx, p.a, p.b, `${chemin}.b`, objet);
        const intrus = presents(["point", "direction", "etendue"]);
        if (intrus.length > 0) refuser(intrus[0] ?? "nature", `champ(s) ${intrus.join(", ")} réservé(s) à une ligne de construction`, "les retirer");
      } else if (p.nature === "construction") {
        const manquants = ["point", "direction", "etendue"].filter((k) => p[k] === undefined);
        if (manquants.length > 0) refuser(manquants[0] ?? "nature", `champ(s) ${manquants.join(", ")} absent(s) pour une ligne de construction`, "les fournir");
        const intrus = presents(["a", "b", "depassement"]);
        if (intrus.length > 0) refuser(intrus[0] ?? "nature", `champ(s) ${intrus.join(", ")} réservé(s) à un axe`, "les retirer");
      }
      return;
    }
    case "esquisse.hachure":
      if (touche(cles, "contour")) controlerContour(tx, o.params.contour, `${chemin}.contour`, objet, false);
      if (touche(cles, "contour", "trous")) controlerTrous(tx, o.params.contour, o.params.trous, `${chemin}.trous`, objet);
      return;
    default:
      return;
  }
};

export const ligne = fabriqueCreation<"esquisse.ligne">("esquisse.ligne", controleEsquisse);
export const polyligne = fabriqueCreation<"esquisse.polyligne">("esquisse.polyligne", controleEsquisse);
export const arc = fabriqueCreation<"esquisse.arc">("esquisse.arc", controleEsquisse);
export const cercle = fabriqueCreation<"esquisse.cercle">("esquisse.cercle", controleEsquisse);
export const rectangle = fabriqueCreation<"esquisse.rectangle">("esquisse.rectangle", controleEsquisse);
export const polygone = fabriqueCreation<"esquisse.polygone">("esquisse.polygone", controleEsquisse);
export const spline = fabriqueCreation<"esquisse.spline">("esquisse.spline", controleEsquisse);
export const construction = fabriqueCreation<"esquisse.construction">("esquisse.construction", controleEsquisse);
export const hachure = fabriqueCreation<"esquisse.hachure">("esquisse.hachure", controleEsquisse);

/** `esquisse.modifier` : `classe` doit être celle de chaque cible. */
export const modifier: Corps<"esquisse.modifier"> = (tx, c) => {
  const classe = c.params.classe;
  if (!(CLASSES_ESQUISSE as readonly string[]).includes(classe)) {
    tx.refuser("classe-inconnue", "params.classe", motif("Esquisse", `classe « ${String(classe)} » inconnue`, `choisir parmi ${CLASSES_ESQUISSE.join(", ")}`));
    return;
  }
  const cibles = exigerCibles(tx, c.cibles, [classe as ClasseEsquisse]);
  if (!cibles) return;
  const mods = c.params.modifications;
  const cles = typeof mods === "object" && mods !== null ? Object.keys(mods) : [];
  for (const o of cibles) {
    const m = fusionnerModifications<ObjetModele>(tx, o, mods, "params.modifications");
    if (!m) return;
    controleEsquisse(tx, m, "params.modifications", cles);
    tx.mettre(m);
  }
};

export const supprimer = fabriqueSuppression<"esquisse.supprimer">(CLASSES_ESQUISSE);
