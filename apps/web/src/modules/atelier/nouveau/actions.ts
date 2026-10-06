/**
 * Actions immédiates sur la sélection (sans tracé) : supprimer, décomposer, grouper, répéter, raccorder,
 * chanfreiner. Fonctions pures : elles rendent le lot de commandes à exécuter, ou un message expliquant la
 * condition d'activation manquante (UX4 : un outil indisponible dit pourquoi).
 */
import { coinsJointifs, profilFerme, decalerPolyligne, pointsPolyligne, pointsArc, pt, type Commande, type ModeleAtelier, type Point2 } from "@parcours/atelier-model";
import type { EtatUi } from "./etat-ui";

export type ResultatAction = { commandes: Commande[]; label: string } | { message: string };

const m = (value: number) => ({ value, unit: "m" as const });

function nombre(ui: EtatUi, cle: string, defaut: number): number {
  const v = ui.parametresOutil[cle];
  return typeof v === "number" && Number.isFinite(v) ? v : defaut;
}

/** Outils qui agissent dès qu'on les choisit, sur la sélection courante. */
export const OUTILS_IMMEDIATS = new Set(["supprimer", "decomposer", "joindre", "axes-murs", "grouper", "repeter", "raccorder", "chanfreiner", "extruder"]);

/** Contour fermé d'une esquisse (rectangle, cercle, polygone, polyligne fermée), ou null. */
export function contourEsquisse(etat: ModeleAtelier, id: string): Point2[] | null {
  const o = etat.objets[id];
  if (!o || o.classe !== "esquisse") return null;
  const p = o.params;
  switch (p.forme) {
    case "rectangle":
      if (p.points.length === 2) {
        const [a, b] = [p.points[0]!, p.points[1]!];
        return [a, pt(b.x, a.y), b, pt(a.x, b.y)];
      }
      return p.points.length >= 3 ? p.points : null;
    case "cercle":
      return p.centre && p.rayon ? pointsArc(p.centre, p.rayon.value, 0, 360, 48).slice(0, -1) : null;
    case "polygone":
    case "hachure":
      return p.points.length >= 3 ? p.points : null;
    case "polyligne":
      // Segments en arc (D-063) : contour discrétisé (11,25° par segment au plus).
      return p.ferme && p.points.length >= 3 ? (p.renflements ? pointsPolyligne(p.points, true, p.renflements) : p.points) : null;
    case "spline":
      return p.ferme && p.points.length >= 3 ? p.points : null;
    default:
      return null;
  }
}

/** Lot de suppression : un mur qui porte des ouvertures les emporte (`avecHeberges`), annoncé dans le libellé. */
export function lotSuppression(etat: ModeleAtelier, ids: readonly string[]): { commandes: Commande[]; label: string } {
  // Les ouvertures dont l'hôte est aussi supprimé partent avec lui : ne pas les supprimer deux fois.
  const murs = new Set(ids.filter((id) => etat.objets[id]?.classe === "mur"));
  const commandes: Commande[] = [];
  let heberges = 0;
  for (const id of ids) {
    const o = etat.objets[id];
    if (!o) continue;
    if ((o.classe === "porte" || o.classe === "fenetre" || o.classe === "ouverture") && murs.has(o.params.murHoteId)) continue;
    if (o.classe === "mur") {
      const n = Object.values(etat.objets).filter((x) => (x.classe === "porte" || x.classe === "fenetre" || x.classe === "ouverture") && x.params.murHoteId === id).length;
      heberges += n;
      commandes.push({ type: "objet.supprimer", params: { id, avecHeberges: n > 0 } });
    } else commandes.push({ type: "objet.supprimer", params: { id } });
  }
  const label = `Supprimer ${commandes.length} objet${commandes.length > 1 ? "s" : ""}${heberges ? ` (et ${heberges} ouverture${heberges > 1 ? "s" : ""} hébergée${heberges > 1 ? "s" : ""})` : ""}`;
  return { commandes, label };
}

export function actionImmediate(outil: string, etat: ModeleAtelier, ui: EtatUi): ResultatAction {
  const sel = ui.selection.filter((id) => etat.objets[id]);
  if (sel.length === 0) return { message: "Sélectionnez d'abord un ou plusieurs objets." };
  switch (outil) {
    case "supprimer":
      return lotSuppression(etat, sel);
    case "decomposer":
      return { commandes: [{ type: "transformer.decomposer", params: {}, cibles: sel }], label: "Décomposer" };
    case "axes-murs": {
      // Axes des murs sélectionnés en lignes de construction (D-050), sur le niveau de chaque mur.
      const murs = sel.map((id) => etat.objets[id]!).filter((o) => o.classe === "mur");
      if (!murs.length) return { message: "Axes des murs : sélectionnez des murs." };
      return { commandes: murs.map((o) => ({ type: "esquisse.construction", params: { niveauId: o.niveauId, points: [(o as { params: { a: unknown } }).params.a, (o as { params: { b: unknown } }).params.b] } })), label: `Axes de ${murs.length} mur${murs.length > 1 ? "s" : ""}` };
    }
    case "joindre":
      if (sel.length < 2) return { message: "Joindre : sélectionnez au moins deux lignes ou polylignes jointives, ou deux murs." };
      // Deux murs (D-068, DA-07-01) : chacun est porté sur l'axe prolongé de l'autre — jonction d'angle.
      if (sel.length === 2 && sel.every((id) => etat.objets[id]?.classe === "mur"))
        return { commandes: [{ type: "mur.joindre", params: { id: sel[0], autreId: sel[1] } }, { type: "mur.joindre", params: { id: sel[1], autreId: sel[0] } }], label: "Joindre deux murs (angle)" };
      return { commandes: [{ type: "transformer.joindre", params: {}, cibles: sel }], label: `Joindre ${sel.length} objets` };
    case "grouper":
      return { commandes: [{ type: "groupe.creer", params: { nom: `Groupe ${Object.keys(etat.groupes).length + 1}` }, cibles: sel }], label: "Grouper" };
    case "repeter": {
      const n = Math.round(nombre(ui, "repetitions", 3));
      return { commandes: [{ type: "transformer.repeter", params: { nombre: n, dx: nombre(ui, "pasX", 1), dy: nombre(ui, "pasY", 0) }, cibles: sel }], label: `Répéter × ${n}` };
    }
    case "raccorder":
    case "chanfreiner": {
      const taille = nombre(ui, outil === "raccorder" ? "rayon" : "distanceChanfrein", 0.5);
      const nomOutil = outil === "raccorder" ? "Raccorder" : "Chanfreiner";
      // Plus de deux éléments (D-094) : un raccord (ou chanfrein) par coin jointif, tous dans un seul lot.
      if (sel.length > 2) {
        const coins = coinsJointifs(etat, sel);
        if (!coins.length) return { message: `${nomOutil} : aucun coin jointif entre les lignes et arcs sélectionnés (extrémités confondues).` };
        return { commandes: coins.map(([id1, id2]) => ({ type: `transformer.${outil}`, params: { id1, id2, [outil === "raccorder" ? "rayon" : "distance"]: m(taille) } })), label: `${nomOutil} ${coins.length} coins` };
      }
      if (sel.length !== 2) return { message: `${nomOutil} : sélectionnez deux lignes d'esquisse, une ligne et un arc, deux arcs, ou plusieurs éléments jointifs.` };
      return { commandes: [{ type: `transformer.${outil}`, params: { id1: sel[0], id2: sel[1], [outil === "raccorder" ? "rayon" : "distance"]: m(taille) } }], label: outil === "raccorder" ? "Raccorder" : "Chanfreiner" };
    }
    case "extruder": {
      const hauteur = nombre(ui, "hauteurSolide", 1);
      const commandes: Commande[] = [];
      for (const id of sel) {
        let contour = contourEsquisse(etat, id);
        const o = etat.objets[id]!;
        // Profil ouvert (D-067, DA-04-01) : ligne ou polyligne ouverte extrudée avec l'épaisseur saisie, centrée sur le tracé.
        const ep = nombre(ui, "epaisseurProfil", 0);
        if (!contour && ep > 0 && o.classe === "esquisse" && (o.params.forme === "ligne" || o.params.forme === "polyligne") && !o.params.ferme) {
          const trace = o.params.renflements ? pointsPolyligne(o.params.points, false, o.params.renflements) : o.params.points;
          contour = [...decalerPolyligne(trace, ep / 2), ...decalerPolyligne(trace, -ep / 2).reverse()];
        }
        // Solide associé (D-114, case de l'outil) : il suivra le profil de l'esquisse fermée.
        const associe = ui.parametresOutil["solideAssocie"] === true && !!profilFerme(o);
        if (contour) commandes.push({ type: "solide.extruder", params: { niveauId: o.niveauId, contour, trous: [], ferme: true, hauteur: m(hauteur), role: "solid", ...(associe ? { sourceId: id } : {}) } });
      }
      if (commandes.length === 0) return { message: "Extruder : sélectionnez une esquisse fermée (rectangle, cercle, polygone), ou une ligne ouverte avec une épaisseur de profil." };
      return { commandes, label: `Extruder ${commandes.length} esquisse${commandes.length > 1 ? "s" : ""} (${String(hauteur).replace(".", ",")} m)` };
    }
    default:
      return { message: "" };
  }
}
