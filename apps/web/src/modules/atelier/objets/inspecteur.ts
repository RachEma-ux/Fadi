/**
 * Descripteurs d'inspecteur des classes d'architecture (contrat `DescripteurInspecteur`, convention D-035) : mur,
 * porte, fenêtre, ouverture, dalle, toiture, escalier, poteau, pièce, espace, zone, solide, niveau.
 *
 * Base : les champs du repli générique de l'interface (`champsGeneriques`, un champ par paramètre déclaré dans
 * l'ontologie, modifiable par `<classe>.modifier`). En plus :
 * - **type** (DA-05-12, DA-05-14 / 15) : choix dans le catalogue (`<classe>.modifier` / `ouverture.modifier`
 *   `typeId`), nom et dimensions proposées du type (`type.modifier`), création d'un type depuis l'occurrence
 *   (`type.definir` puis affectation, un seul lot) ;
 * - **niveaux reliés** (niveau haut d'un mur, départ / arrivée d'un escalier) : choix parmi les niveaux ;
 * - **valeurs calculées** en lecture seule (longueur d'un mur, aire d'une pièce, hauteur de contremarche, giron,
 *   2h + g de l'escalier) ; position d'une baie (distance au centre, `ouverture.deplacer`) ;
 * - **propriétés BIM** (DA-06-07, `propriete.definir`, provenance « saisie ») et **classification** (DA-06-08,
 *   `classification.affecter`). Une propriété importée (`import.*`) reste en lecture seule (R7).
 */
import {
  cleDefinition,
  CLASSES_BAIE,
  estClasseTypee,
  estNonEvaluee,
  ID_NON_TYPE,
  PREFIXE_PROPRIETE_IMPORT,
  type ClasseTypee,
  type Commande,
  type EtatModele,
  type ObjetModele,
  type ObjetNiveau,
  type PointLocal,
  type PolygoneAvecTrous,
  type Unite,
} from "@parcours/atelier-model";
import type { ChampInspecteur, ContexteAtelier, DescripteurInspecteur, ErreurLisible } from "../socle";
import { commande, lisible, longueur } from "../plan2d/outils/commun";
import { champsGeneriques, texteTracabilite } from "../ui/inspecteur-generique";
import { libelleObjet } from "../ui/navigateur";
import { aireContour, repereAxe } from "./geometrie";
import { indicesEscalier } from "./outils/escalier";

type Champ = ChampInspecteur;

/** Champ en lecture seule (valeur calculée ou importée). */
export function champLecture(cle: string, libelle: string, valeur: unknown, extra: Partial<Champ> = {}): Champ {
  return { cle, libelle, type: "texte", valeur, lectureSeule: true, provenance: "calculée", controler: () => lisible(libelle, "valeur en lecture seule", "modifier les paramètres dont elle dépend"), commandes: () => [], ...extra };
}

const modifier = (o: ObjetModele, modifications: Record<string, unknown>): Commande => {
  const type = (CLASSES_BAIE as readonly string[]).includes(o.classe) ? "ouverture.modifier" : (`${o.classe}.modifier` as Commande["type"]);
  return commande(type, { modifications }, [o.id]);
};

const niveaux = (etat: EtatModele | null): ObjetNiveau[] =>
  etat ? Object.values(etat.objets).filter((o): o is ObjetNiveau => o.classe === "niveau").sort((a, b) => a.params.ordre - b.params.ordre) : [];

/** Choix d'un niveau pour un paramètre identifiant (facultatif : vidé = retiré, D-024). */
function champNiveau(o: ObjetModele, ctx: ContexteAtelier, cle: string, libelle: string, obligatoire: boolean): Champ {
  const valeur = (o.params as unknown as Record<string, unknown>)[cle];
  const choix = niveaux(ctx.etat()).map((n) => ({ valeur: n.id, libelle: n.params.nom }));
  return {
    cle,
    libelle,
    type: "choix",
    valeur: typeof valeur === "string" ? valeur : null,
    choix,
    lectureSeule: false,
    controler: (v) => (v === null ? (obligatoire ? lisible(libelle, "valeur obligatoire", "choisir un niveau") : null) : choix.some((c) => c.valeur === v) ? null : lisible(libelle, `niveau « ${String(v)} » inconnu`, "choisir un niveau de la liste")),
    commandes: (v) => [modifier(o, { [cle]: v })],
  };
}

// --- Types ---------------------------------------------------------------------------------------------------

/** Identifiant de type dérivé d'un nom (minuscules sans accents, tirets), unique dans la classe. */
export function identifiantType(etat: EtatModele | null, classe: ClasseTypee, nom: string): string {
  const base = nom.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "type";
  let id = base;
  for (let i = 2; etat?.catalogue.definitions[cleDefinition(classe, id)] !== undefined || id === ID_NON_TYPE; i++) id = `${base}-${i}`;
  return id;
}

const DIMENSIONS: Readonly<Record<ClasseTypee, readonly ("epaisseur" | "hauteur" | "largeur" | "allege")[]>> = {
  mur: ["epaisseur", "hauteur"],
  porte: ["largeur", "hauteur"],
  fenetre: ["largeur", "hauteur", "allege"],
  ouverture: ["largeur", "hauteur"],
};
const LIBELLES_DIMENSION = { epaisseur: "Épaisseur", hauteur: "Hauteur", largeur: "Largeur", allege: "Allège" } as const;

function champsType(o: ObjetModele, ctx: ContexteAtelier, classe: ClasseTypee): Champ[] {
  const etat = ctx.etat();
  const typeId = (o.params as { typeId?: string }).typeId ?? ID_NON_TYPE;
  const defs = etat ? Object.values(etat.catalogue.definitions).filter((d) => d.classe === classe) : [];
  const def = etat?.catalogue.definitions[cleDefinition(classe, typeId)];
  const choix = [{ valeur: ID_NON_TYPE, libelle: "Sans type" }, ...defs.filter((d) => d.id !== ID_NON_TYPE).map((d) => ({ valeur: d.id, libelle: d.nom }))];
  const champs: Champ[] = [
    {
      cle: "typeId",
      libelle: "Type",
      type: "choix",
      valeur: typeId,
      choix,
      lectureSeule: false,
      provenance: def ? `catalogue version ${def.versionCatalogue}` : "aucune définition (sans type)",
      controler: (v) => (typeof v === "string" && choix.some((c) => c.valeur === v) ? null : lisible("Type", `« ${String(v)} » absent du catalogue`, "choisir un type de la liste ou en créer un")),
      commandes: (v) => [modifier(o, { typeId: v })],
    },
  ];
  if (def && def.id !== ID_NON_TYPE) {
    champs.push({
      cle: "type.nom",
      libelle: "Nom du type",
      type: "texte",
      valeur: def.nom,
      lectureSeule: false,
      provenance: texteTracabilite(def),
      controler: (v) => (typeof v === "string" && v.trim() !== "" ? null : lisible("Nom du type", "nom vide", "saisir un nom")),
      commandes: (v) => [commande("type.modifier", { classe, id: def.id, modifications: { nom: v } })],
    });
    for (const k of DIMENSIONS[classe]) {
      const libelle = `${LIBELLES_DIMENSION[k]} proposée par le type`;
      champs.push({
        cle: `type.${k}`,
        libelle,
        type: "longueur",
        unite: "m",
        valeur: def.dimensionsProposees?.[k] ?? null,
        lectureSeule: false,
        provenance: "valeur proposée à la création, jamais imposée aux occurrences (DA-05-14)",
        controler: (v) => (v === null || (typeof v === "number" && (k === "allege" ? v >= 0 : v > 0)) ? null : lisible(libelle, "valeur hors bornes", k === "allege" ? "saisir une valeur positive ou nulle" : "saisir une valeur strictement positive")),
        commandes: (v) => {
          const reste = { ...(def.dimensionsProposees ?? {}) } as Record<string, unknown>;
          if (v === null) delete reste[k];
          else reste[k] = longueur(v as number);
          return [commande("type.modifier", { classe, id: def.id, modifications: { dimensionsProposees: Object.keys(reste).length > 0 ? reste : null } })];
        },
      });
    }
  }
  champs.push({
    cle: "type.nouveau",
    libelle: "Créer un type depuis cet objet",
    type: "texte",
    valeur: null,
    lectureSeule: false,
    provenance: "nom du nouveau type ; ses dimensions proposées sont celles de l'objet",
    controler: (v) => (typeof v === "string" && v.trim() !== "" ? null : lisible("Nouveau type", "nom vide", "saisir le nom du type à créer")),
    commandes: (v) => {
      const nom = String(v).trim();
      const id = identifiantType(etat, classe, nom);
      const p = o.params as unknown as Record<string, unknown>;
      const dimensions = Object.fromEntries(DIMENSIONS[classe].filter((k) => p[k] !== undefined && !estNonEvaluee(p[k])).map((k) => [k, p[k]]));
      return [
        commande("type.definir", { definition: { id, classe, nom, ...(Object.keys(dimensions).length > 0 ? { dimensionsProposees: dimensions } : {}), proprietes: [], provenance: "saisie", statut: "declaree" } }),
        modifier(o, { typeId: id }),
      ];
    },
  });
  return champs;
}

// --- Propriétés BIM et classification -------------------------------------------------------------------------

const UNITES_PROPRIETE: readonly Unite[] = ["m", "m²", "m³", "°", "kg/m²", "kN/m²"];

/** Lecture de « nom = valeur [unité] » : nombre avec unité, oui / non, ou texte. */
export function lirePropriete(texte: string): { nom: string; valeur: string | number | boolean; unite?: Unite } | ErreurLisible {
  const i = texte.indexOf("=");
  if (i <= 0) return lisible("Nouvelle propriété", "forme « nom = valeur » attendue", "saisir par exemple « résistance au feu = EI 60 » ou « surface utile = 12,5 m² »");
  const nom = texte.slice(0, i).trim();
  const brut = texte.slice(i + 1).trim();
  if (!nom || !brut) return lisible("Nouvelle propriété", "nom ou valeur vide", "saisir « nom = valeur »");
  if (nom.startsWith(PREFIXE_PROPRIETE_IMPORT)) return lisible(`Propriété « ${nom} »`, `le préfixe « ${PREFIXE_PROPRIETE_IMPORT} » est réservé aux valeurs importées (R7)`, "choisir un autre nom");
  const m = /^(-?\d+(?:[.,]\d+)?)\s*(\S+)?$/.exec(brut);
  if (m) {
    const valeur = Number((m[1] as string).replace(",", "."));
    const unite = m[2] as Unite | undefined;
    if (!unite) return lisible(`Propriété « ${nom} »`, "grandeur sans unité", `préciser l'unité (${UNITES_PROPRIETE.join(", ")})`);
    if (!UNITES_PROPRIETE.includes(unite)) return lisible(`Propriété « ${nom} »`, `unité « ${unite} » non admise`, `utiliser ${UNITES_PROPRIETE.join(", ")}`);
    return { nom, valeur, unite };
  }
  if (brut === "oui" || brut === "non") return { nom, valeur: brut === "oui" };
  return { nom, valeur: brut };
}

const SAISIE = { provenance: "saisie", statut: "declaree" } as const;

function champsProprietes(o: ObjetModele): Champ[] {
  const champs: Champ[] = o.proprietes.map((p): Champ => {
    const importee = p.nom.startsWith(PREFIXE_PROPRIETE_IMPORT) || (p.provenance !== "saisie" && p.provenance !== "regle");
    const nombre = typeof p.valeur === "number";
    const libelle = `Propriété « ${p.nom} »`;
    if (importee || !(nombre || typeof p.valeur === "string" || typeof p.valeur === "boolean")) {
      return champLecture(`propriete:${p.nom}`, libelle, p.valeur, { provenance: texteTracabilite(p), ...(p.unite ? { unite: p.unite } : {}) });
    }
    return {
      cle: `propriete:${p.nom}`,
      libelle,
      type: nombre ? "nombre" : typeof p.valeur === "boolean" ? "booleen" : "texte",
      ...(p.unite ? { unite: p.unite } : {}),
      valeur: p.valeur,
      lectureSeule: false,
      provenance: texteTracabilite(p),
      controler: (v) => (v === null || (nombre ? typeof v === "number" && Number.isFinite(v) : typeof v === typeof p.valeur) ? null : lisible(libelle, nombre ? "nombre attendu" : "valeur mal formée", "corriger la saisie")),
      commandes: (v) => [commande("propriete.definir", v === null ? { nom: p.nom, valeur: null, retirer: true, ...SAISIE } : { nom: p.nom, valeur: v, ...(p.unite ? { unite: p.unite } : {}), ...SAISIE }, [o.id])],
    };
  });
  champs.push({
    cle: "propriete:nouvelle",
    libelle: "Ajouter une propriété (nom = valeur)",
    type: "texte",
    valeur: null,
    lectureSeule: false,
    provenance: "propriété saisie (DA-06-07)",
    controler: (v) => {
      if (typeof v !== "string") return lisible("Nouvelle propriété", "texte attendu", "saisir « nom = valeur »");
      const r = lirePropriete(v);
      return "message" in r ? r : null;
    },
    commandes: (v) => {
      const r = lirePropriete(String(v));
      return "message" in r ? [] : [commande("propriete.definir", { ...r, ...SAISIE }, [o.id])];
    },
  });
  return champs;
}

/** Lecture de « système : code [— libellé] ». */
export function lireClassification(texte: string): { systeme: string; code: string; libelle?: string } | ErreurLisible {
  const m = /^([^:]+):([^—]+)(?:—(.+))?$/.exec(texte);
  const systeme = m?.[1]?.trim();
  const code = m?.[2]?.trim();
  if (!systeme || !code) return lisible("Classification", "forme « système : code » attendue", "saisir par exemple « Uniclass : EF_25_10 » (aucun système n'est imposé)");
  const libelle = m?.[3]?.trim();
  return { systeme, code, ...(libelle ? { libelle } : {}) };
}

function champClassification(o: ObjetModele): Champ {
  const actuelles = o.classifications ?? [];
  return {
    cle: "classification",
    libelle: "Classification (système : code)",
    type: "texte",
    valeur: actuelles.length > 0 ? actuelles.map((c) => `${c.systeme} : ${c.code}${c.libelle ? ` — ${c.libelle}` : ""}`).join(" ; ") : null,
    lectureSeule: false,
    provenance: actuelles.map((c) => `${c.systeme} : ${c.provenance}`).join(" ; ") || "aucune (aucun système imposé, DA-06-08)",
    controler: (v) => {
      if (typeof v !== "string") return lisible("Classification", "texte attendu", "saisir « système : code »");
      const r = lireClassification(v);
      return "message" in r ? r : null;
    },
    commandes: (v) => {
      const r = lireClassification(String(v));
      return "message" in r ? [] : [commande("classification.affecter", { classification: { ...r, provenance: "saisie" } }, [o.id])];
    },
  };
}

// --- Champs propres aux classes -------------------------------------------------------------------------------

const aireNette = (polys: readonly PolygoneAvecTrous<PointLocal>[]): number => polys.reduce((s, p) => s + aireContour(p.contour) - p.trous.reduce((t, h) => t + aireContour(h.polygone), 0), 0);

function champsPropres(o: ObjetModele, ctx: ContexteAtelier): Champ[] {
  const etat = ctx.etat();
  switch (o.classe) {
    case "mur": {
      const r = repereAxe(o.params.axe.a, o.params.axe.b);
      return [champLecture("longueur", "Longueur (axe)", r ? { value: r.L, unit: "m" } : null), champNiveau(o, ctx, "niveauHaut", "Niveau haut", false)];
    }
    case "porte":
    case "fenetre":
    case "ouverture": {
      const hote = etat?.objets[o.params.murHoteId];
      const r = hote?.classe === "mur" ? repereAxe(hote.params.axe.a, hote.params.axe.b) : null;
      if (!r) return [champLecture("distance", "Distance au centre", null, { provenance: "mur hôte introuvable" })];
      return [
        {
          cle: "distance",
          libelle: "Distance au centre (depuis le début du mur)",
          type: "longueur",
          unite: "m",
          valeur: o.params.position.t * r.L,
          lectureSeule: false,
          provenance: "calculée : t × longueur du mur (DA-07-02)",
          controler: (v) => (typeof v === "number" && v >= 0 && v <= r.L ? null : lisible("Position", `distance hors du mur (0 à ${r.L} m)`, "saisir une distance sur le mur")),
          commandes: (v) => [commande("ouverture.deplacer", { t: (v as number) / r.L }, [o.id])],
        },
      ];
    }
    case "dalle":
      // Types de dalle absents du contrat (`type.definir` limité à mur, porte, fenêtre, ouverture : D-038).
      return [champLecture("typeId", "Type", o.params.typeId ?? null, { provenance: "types de dalle non disponibles au contrat atelier-commands/1 (D-038)" })];
    case "piece":
    case "espace":
      return [champLecture("aire", "Surface (contour courant)", { value: aireNette(o.params.polygones), unit: "m²" })];
    case "zone": {
      const ids = (etat?.relations ?? []).filter((r) => r.type === "contient" && r.sourceId === o.id).map((r) => r.cibleId);
      const membres = ids.flatMap((id) => {
        const x = etat?.objets[id];
        return x?.classe === "piece" || x?.classe === "espace" ? [x] : [];
      });
      return [
        champLecture("contenu", "Contenu", membres.length > 0 ? membres.map((x) => x.params.nom).join(", ") : null, { provenance: "relations « contient » ; modifier le contenu avec l'outil Zone" }),
        champLecture("aire", "Surface (somme du contenu)", { value: aireNette([...o.params.polygones, ...membres.flatMap((x) => x.params.polygones)]), unit: "m²" }),
      ];
    }
    case "escalier": {
      const i = indicesEscalier(o, etat);
      return [
        champNiveau(o, ctx, "niveauDepartId", "Niveau de départ", false),
        champNiveau(o, ctx, "niveauArriveeId", "Niveau d'arrivée", false),
        champLecture("hauteurContremarche", "Hauteur de contremarche", i.hauteur === null ? null : { value: i.hauteur, unit: "m" }),
        champLecture("giron", "Giron", i.giron === null ? null : { value: i.giron, unit: "m" }),
        champLecture("blondel", "2h + g (loi de Blondel, indicatif)", i.blondel === null ? null : { value: i.blondel, unit: "m" }),
      ];
    }
    default:
      return [];
  }
}

/** Paramètres repris par des champs propres (le champ générique correspondant est retiré). */
const REMPLACES: Readonly<Record<string, readonly string[]>> = {
  mur: ["typeId", "niveauHaut"],
  porte: ["typeId"],
  fenetre: ["typeId"],
  ouverture: ["typeId"],
  dalle: ["typeId"],
  escalier: ["niveauDepartId", "niveauArriveeId"],
};

export function champsObjet(o: ObjetModele, ctx: ContexteAtelier): readonly Champ[] {
  const remplaces = REMPLACES[o.classe] ?? [];
  const generiques = champsGeneriques(o, libelleObjet(o)).filter((c) => !remplaces.includes(c.cle));
  return [...generiques, ...champsPropres(o, ctx), ...(estClasseTypee(o.classe as never) ? champsType(o, ctx, o.classe as ClasseTypee) : []), ...champsProprietes(o), champClassification(o)];
}

export const CLASSES_INSPECTEUR = ["niveau", "mur", "porte", "fenetre", "ouverture", "dalle", "toiture", "escalier", "poteau", "piece", "espace", "zone", "solide"] as const;

export const DESCRIPTEUR_ARCHITECTURE: DescripteurInspecteur = { classes: [...CLASSES_INSPECTEUR], champs: champsObjet };
