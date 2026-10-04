/**
 * Descripteurs d'inspecteur des annotations (`cotation`, `texte`, `etiquette`), convention de valeur D-035 :
 * nombres en m, textes en `string`, `null` = retirer un paramètre facultatif. Chaque champ modifiable produit une
 * commande `<classe>.modifier` (`{ modifications }`, cible = l'objet), jamais une écriture directe ; la valeur
 * dérivée d'une cote (‖b − a‖) est en lecture seule et exacte.
 */
import type { Commande, ObjetModele, PointLocal } from "@parcours/atelier-model";
import type { ChampInspecteur, DescripteurInspecteur } from "../socle";
import { distance, pt } from "../plan2d/geometrie";
import { lisible } from "./format";
import { controlerTexte } from "./outils/annotation";

const modifier = (type: Commande["type"], id: string, modifications: Record<string, unknown>): Commande => ({ type, params: { modifications }, cibles: [id] }) as unknown as Commande;

const lecture = (cle: string, libelle: string, type: ChampInspecteur["type"], valeur: unknown, unite?: string): ChampInspecteur => ({
  cle,
  libelle,
  type,
  ...(unite ? { unite } : {}),
  valeur,
  lectureSeule: true,
  controler: () => lisible(libelle, "valeur dérivée, en lecture seule", "modifier les paramètres dont elle dépend"),
  commandes: () => [],
});

function nombreFini(libelle: string, v: unknown) {
  return typeof v === "number" && Number.isFinite(v) ? null : lisible(libelle, "nombre attendu", "taper une valeur en mètres, ex. 0,60");
}

/** Champs x et y d'un point (`cle` = paramètre), modifiés ensemble par la commande de la classe. */
function champsPoint(type: Commande["type"], o: ObjetModele, cle: string, nom: string, p: PointLocal): ChampInspecteur[] {
  return (["x", "y"] as const).map((axe) => ({
    cle: `${cle}.${axe}`,
    libelle: `${nom} ${axe}`,
    type: "longueur" as const,
    unite: "m",
    valeur: p[axe],
    lectureSeule: false,
    provenance: "repère local du projet",
    controler: (v: unknown) => nombreFini(`${nom} ${axe}`, v),
    commandes: (v: unknown) => [modifier(type, o.id, { [cle]: axe === "x" ? pt(v as number, p.y) : pt(p.x, v as number) })],
  }));
}

/** Champ de texte (obligatoire : vide refusé ; facultatif : vide = retirer). */
function champTexte(type: Commande["type"], o: ObjetModele, cle: string, libelle: string, valeur: string | undefined, obligatoire: boolean): ChampInspecteur {
  return {
    cle,
    libelle,
    type: "texte",
    valeur,
    lectureSeule: false,
    controler: (v: unknown) => {
      if (v === null) return obligatoire ? lisible(libelle, "texte vide", "saisir un texte ou supprimer l'objet") : null;
      if (typeof v !== "string") return lisible(libelle, "texte attendu", "saisir un texte");
      const c = controlerTexte(v);
      return c.ok ? null : { ...c.erreur, objet: libelle, message: `${libelle} : ${c.erreur.cause} — ${c.erreur.action}` };
    },
    commandes: (v: unknown) => {
      const c = typeof v === "string" ? controlerTexte(v) : null;
      return [modifier(type, o.id, { [cle]: c?.ok ? c.texte : v })];
    },
  };
}

export function champsCotation(o: ObjetModele): ChampInspecteur[] {
  if (o.classe !== "cotation") return [];
  const { a, b, decalage, texteRemplacement, etat } = o.params;
  return [
    lecture("valeur", "Valeur mesurée", "longueur", distance(a, b), "m"),
    lecture("etat", "État", "texte", etat === "libre" ? "Cotation libre : ne suit pas les objets" : etat === "rattachee" ? "Cotation rattachée" : "Cotation à réparer"),
    ...champsPoint("cotation.modifier", o, "a", "Point a", a),
    ...champsPoint("cotation.modifier", o, "b", "Point b", b),
    {
      cle: "decalage",
      libelle: "Décalage de cote",
      type: "longueur",
      unite: "m",
      valeur: decalage.value,
      lectureSeule: false,
      provenance: "signé : positif à gauche de a→b",
      controler: (v) => nombreFini("Décalage de cote", v),
      commandes: (v) => [modifier("cotation.modifier", o.id, { decalage: { value: v as number, unit: "m" } })],
    },
    champTexte("cotation.modifier", o, "texteRemplacement", "Texte de remplacement", texteRemplacement, false),
  ];
}

export function champsTexte(o: ObjetModele): ChampInspecteur[] {
  if (o.classe !== "texte") return [];
  return [champTexte("texte.modifier", o, "texte", "Texte", o.params.texte, true), ...champsPoint("texte.modifier", o, "position", "Position", o.params.position)];
}

export function champsEtiquette(o: ObjetModele): ChampInspecteur[] {
  if (o.classe !== "etiquette") return [];
  const { texte, position, objetId, caracteristique } = o.params;
  return [
    champTexte("etiquette.modifier", o, "texte", "Texte", texte, false),
    ...champsPoint("etiquette.modifier", o, "position", "Position", position),
    lecture("objetId", "Objet étiqueté", "texte", objetId),
    lecture("caracteristique", "Caractéristique", "texte", caracteristique),
  ];
}

export const DESCRIPTEUR_ANNOTATIONS: DescripteurInspecteur = {
  classes: ["cotation", "texte", "etiquette"],
  champs: (o) => [...champsCotation(o), ...champsTexte(o), ...champsEtiquette(o)],
};
