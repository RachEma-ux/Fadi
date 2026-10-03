/**
 * Validation des paramètres canoniques de chaque classe (section 5.2) : unités, bornes, préconditions sur les
 * objets référencés. Retourne des paramètres typés ou lève `ErreurCommande` (400 côté API) — jamais de valeur
 * par défaut inventée pour une grandeur physique (R3) : une hauteur absente reste `null`.
 */
import { distance } from "../geometrie.js";
import type { ModeleAtelier, ParamsParClasse } from "../modele.js";
import type { Classe } from "../ontologie.js";
import { TOLERANCE_REDUCTEUR } from "../unites.js";
import { ErreurCommande, lire } from "./base.js";

type Brut = Record<string, unknown>;

function surfaceOuNull(params: Brut, cle: string) {
  const v = params[cle];
  if (v === undefined || v === null) return null;
  if (typeof v !== "object" || (v as { unit?: string }).unit !== "m2" || !Number.isFinite((v as { value?: number }).value)) {
    throw new ErreurCommande("invalide", cle, `« ${cle} » doit être une surface ({ value, unit: "m2" })`);
  }
  return { value: (v as { value: number }).value, unit: "m2" as const };
}

function contour(params: Brut, min = 3) {
  const c = lire.points(params, "contour", { min });
  return { contour: c, trous: lire.trous(params) };
}

export const VALIDATEURS: { [C in Classe]: (etat: ModeleAtelier, params: Brut) => ParamsParClasse[C] } = {
  mur(etat, p) {
    const a = lire.point(p, "a")!;
    const b = lire.point(p, "b")!;
    if (distance(a, b) <= TOLERANCE_REDUCTEUR) throw new ErreurCommande("invalide", "b", "mur de longueur nulle");
    const niveauHautId = lire.chaineOuNull(p, "niveauHautId");
    if (niveauHautId !== null && !etat.niveaux[niveauHautId]) throw new ErreurCommande("precondition", "niveauHautId", `niveau inconnu : ${niveauHautId}`);
    return {
      a,
      b,
      epaisseur: lire.longueur(p, "epaisseur", { strict: true })!,
      hauteur: lire.longueur(p, "hauteur", { optionnel: true, strict: true }),
      niveauHautId,
      alignement: lire.enumeration(p, "alignement", ["gauche", "axe", "droite"] as const, "axe"),
      exterieur: lire.booleen(p, "exterieur", false),
      nom: lire.chaineOuNull(p, "nom"),
    };
  },
  porte: (etat, p) => ouverture(etat, p),
  fenetre: (etat, p) => ouverture(etat, p),
  ouverture: (etat, p) => ouverture(etat, p),
  dalle(_etat, p) {
    return { ...contour(p), epaisseur: lire.longueur(p, "epaisseur", { strict: true })!, decalageBase: lire.longueur(p, "decalageBase", { optionnel: true }) ?? { value: 0, unit: "m" }, nom: lire.chaineOuNull(p, "nom") };
  },
  toiture(_etat, p) {
    return {
      ...contour(p),
      type: lire.enumeration(p, "type", ["plate", "monopente", "bipente"] as const, "plate"),
      epaisseur: lire.longueur(p, "epaisseur", { strict: true })!,
      pente: lire.angle(p, "pente", { optionnel: true }),
      decalageBase: lire.longueur(p, "decalageBase", { optionnel: true }) ?? { value: 0, unit: "m" },
      nom: lire.chaineOuNull(p, "nom"),
    };
  },
  escalier(etat, p) {
    const a = lire.point(p, "a")!;
    const b = lire.point(p, "b")!;
    if (distance(a, b) <= TOLERANCE_REDUCTEUR) throw new ErreurCommande("invalide", "b", "escalier de longueur nulle");
    const niveauDepartId = lire.chaine(p, "niveauDepartId");
    if (!etat.niveaux[niveauDepartId]) throw new ErreurCommande("precondition", "niveauDepartId", `niveau inconnu : ${niveauDepartId}`);
    const niveauArriveeId = lire.chaineOuNull(p, "niveauArriveeId");
    if (niveauArriveeId !== null && !etat.niveaux[niveauArriveeId]) throw new ErreurCommande("precondition", "niveauArriveeId", `niveau d'arrivée inconnu : ${niveauArriveeId}`);
    return {
      a,
      b,
      largeur: lire.longueur(p, "largeur", { strict: true })!,
      hauteurAFranchir: lire.longueur(p, "hauteurAFranchir", { strict: true })!,
      marches: lire.nombre(p, "marches", { optionnel: true, entier: true, min: 1 }),
      contremarches: lire.nombre(p, "contremarches", { optionnel: true, entier: true, min: 1 }),
      epaisseurPaillasse: lire.longueur(p, "epaisseurPaillasse", { optionnel: true, strict: true }),
      decalageBase: lire.longueur(p, "decalageBase", { optionnel: true }) ?? { value: 0, unit: "m" },
      niveauDepartId,
      niveauArriveeId,
      groupe: lire.chaineOuNull(p, "groupe"),
      referencePlanSeulement: lire.booleen(p, "referencePlanSeulement", false),
      nom: lire.chaineOuNull(p, "nom"),
    };
  },
  piece(_etat, p) {
    return {
      ...contour(p),
      code: lire.chaineOuNull(p, "code"),
      nom: lire.chaine(p, "nom"),
      categorie: lire.chaineOuNull(p, "categorie"),
      aireDeclaree: surfaceOuNull(p, "aireDeclaree"),
      notes: lire.chaineOuNull(p, "notes"),
      etiquette: lire.point(p, "etiquette", { optionnel: true }),
    };
  },
  espace(_etat, p) {
    const polys = p["polygones"];
    if (!Array.isArray(polys) || polys.length === 0) throw new ErreurCommande("invalide", "polygones", "« polygones » requis (au moins un contour)");
    const polygones = polys.map((poly, i) => {
      if (typeof poly !== "object" || poly === null) throw new ErreurCommande("invalide", `polygones[${i}]`, "contour attendu");
      return contour(poly as Brut);
    });
    return {
      polygones,
      code: lire.chaineOuNull(p, "code"),
      nom: lire.chaine(p, "nom"),
      categorie: lire.chaineOuNull(p, "categorie"),
      aireDeclaree: surfaceOuNull(p, "aireDeclaree"),
      notes: lire.chaineOuNull(p, "notes"),
      etiquette: lire.point(p, "etiquette", { optionnel: true }),
    };
  },
  zone(_etat, p) {
    return { ...contour(p), nom: lire.chaine(p, "nom"), categorie: lire.chaineOuNull(p, "categorie") };
  },
  poteau(_etat, p) {
    return {
      point: lire.point(p, "point")!,
      formeId: lire.chaine(p, "formeId"),
      largeur: lire.longueur(p, "largeur", { strict: true })!,
      profondeur: lire.longueur(p, "profondeur", { strict: true })!,
      hauteur: lire.longueur(p, "hauteur", { optionnel: true, strict: true }),
      angle: lire.angle(p, "angle", { optionnel: true }) ?? { value: 0, unit: "deg" },
      nom: lire.chaineOuNull(p, "nom"),
      statutConception: lire.chaineOuNull(p, "statutConception"),
    };
  },
  solide(_etat, p) {
    const ferme = lire.booleen(p, "ferme", true);
    return {
      ...contour(p, ferme ? 3 : 2),
      ferme,
      hauteur: lire.longueur(p, "hauteur", { optionnel: true }),
      decalageBase: lire.longueur(p, "decalageBase", { optionnel: true }) ?? { value: 0, unit: "m" },
      epaisseur: lire.longueur(p, "epaisseur", { optionnel: true }),
      role: lire.chaine(p, "role", { optionnel: true }) || "solid",
      nom: lire.chaineOuNull(p, "nom"),
      couleur: lire.chaineOuNull(p, "couleur"),
    };
  },
  esquisse(_etat, p) {
    const forme = lire.enumeration(p, "forme", ["ligne", "polyligne", "arc", "cercle", "rectangle", "polygone", "spline", "construction", "hachure"] as const);
    const minPoints: Record<typeof forme, number> = { ligne: 2, polyligne: 2, arc: 0, cercle: 0, rectangle: 2, polygone: 3, spline: 2, construction: 2, hachure: 3 };
    const points = lire.points(p, "points", { min: minPoints[forme], optionnel: minPoints[forme] === 0 });
    const centre = lire.point(p, "centre", { optionnel: true });
    const rayon = lire.longueur(p, "rayon", { optionnel: true, strict: true });
    if ((forme === "arc" || forme === "cercle") && (!centre || !rayon)) throw new ErreurCommande("invalide", "centre", `${forme} : centre et rayon requis`);
    if (forme === "ligne" || forme === "construction") {
      if (distance(points[0]!, points[1]!) <= TOLERANCE_REDUCTEUR) throw new ErreurCommande("invalide", "points", "segment de longueur nulle");
    }
    return {
      forme,
      points,
      ferme: lire.booleen(p, "ferme", forme === "polygone" || forme === "rectangle" || forme === "hachure" || forme === "cercle"),
      centre,
      rayon,
      angleDebut: lire.angle(p, "angleDebut", { optionnel: true }),
      angleFin: lire.angle(p, "angleFin", { optionnel: true }),
      motif: lire.chaineOuNull(p, "motif"),
    };
  },
  "reference-plan"(_etat, p) {
    return { ...contour(p), source: lire.chaineOuNull(p, "source"), echelle: lire.nombre(p, "echelle", { optionnel: true, min: 0 }), nom: lire.chaineOuNull(p, "nom") };
  },
  cotation(_etat, p) {
    return { a: lire.point(p, "a")!, b: lire.point(p, "b")!, decalage: lire.longueur(p, "decalage", { optionnel: true }) ?? { value: 0, unit: "m" } };
  },
  texte(_etat, p) {
    return { position: lire.point(p, "position")!, texte: lire.chaine(p, "texte") };
  },
  etiquette(etat, p) {
    const objetId = lire.chaineOuNull(p, "objetId");
    if (objetId !== null && !etat.objets[objetId]) throw new ErreurCommande("precondition", "objetId", `objet inconnu : ${objetId}`);
    return { position: lire.point(p, "position")!, texte: lire.chaine(p, "texte"), objetId };
  },
  "bloc-occurrence"(_etat, p) {
    return { position: lire.point(p, "position")!, angle: lire.angle(p, "angle", { optionnel: true }) ?? { value: 0, unit: "deg" }, echelle: lire.nombre(p, "echelle", { optionnel: true, min: 0 }) ?? 1 };
  },
};

function ouverture(etat: ModeleAtelier, p: Brut): ParamsParClasse["porte"] {
  const murHoteId = lire.chaine(p, "murHoteId");
  const hote = etat.objets[murHoteId];
  if (!hote || hote.classe !== "mur") throw new ErreurCommande("precondition", "murHoteId", `mur hôte introuvable : ${murHoteId}`);
  const position = lire.nombre(p, "position", { min: 0, max: 1 })!;
  const largeur = lire.longueur(p, "largeur", { strict: true })!;
  const longueurMur = distance(hote.params.a, hote.params.b);
  const demi = largeur.value / 2 / longueurMur;
  if (position - demi < -1e-9 || position + demi > 1 + 1e-9) throw new ErreurCommande("precondition", "position", "l'emprise de l'ouverture sort du mur hôte");
  return {
    murHoteId,
    position,
    largeur,
    hauteur: lire.longueur(p, "hauteur", { strict: true })!,
    allege: lire.longueur(p, "allege", { optionnel: true }),
    repere: lire.chaineOuNull(p, "repere"),
  };
}

export function validerParams<C extends Classe>(etat: ModeleAtelier, classe: C, params: Brut): ParamsParClasse[C] {
  return VALIDATEURS[classe](etat, params);
}
