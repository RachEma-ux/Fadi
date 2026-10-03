/**
 * Organisation (annexe B, DA-05-01, DA-05-14 / 15, DA-06-07 / 08) : calques, groupes, blocs (lot 5),
 * définitions de types, propriétés, classification.
 *
 * - calque : nom unique, couleur `#rrggbb`, ordre unique ; suppression d'un calque non vide sans destination
 *   refusée avec la liste des objets ; un calque verrouillé refuse toute modification de ses objets (contrôle
 *   commun du moteur) et sa propre suppression ;
 * - groupe : un objet appartient à au plus un groupe ; relation `appartient-a` portée par la commande ;
 * - types : catalogue versionné (+1 à chaque définition ou modification), classe IFC dérivée, jamais saisie ;
 * - propriété : provenance `saisie` ou `regle` seulement (les provenances `import`, `prototype`, `calcul`
 *   sont réservées à l'importeur et aux moteurs), grandeur numérique avec unité, statut `verifiee` avec une
 *   source ; un paramètre canonique ou une propriété importée (`import.*`) ne se modifie pas par ce biais.
 */
import { CLASSES_IFC } from "../ontologie/ifc.js";
import { CLASSES_TYPEES, cleDefinition, ID_NON_TYPE, type DefinitionType } from "../ontologie/definitions.js";
import { descripteur } from "../ontologie/descripteurs.js";
import type { IdObjet, ObjetCalque, ObjetModele } from "../ontologie/classes.js";
import { controlerTracabilite } from "../ontologie/provenance.js";
import { controlerPropriete, PREFIXE_PROPRIETE_IMPORT, type Classification, type Propriete } from "../ontologie/proprietes.js";
import { RELATIONS_ADMISES } from "../ontologie/relations.js";
import { controlerGrandeur, estUnite } from "../ontologie/unites.js";
import { controlerIdentifiantLibre, exigerCibles, fusionnerModifications, nomObjet, nouvelObjet, sansCles, supprimerObjet, type Corps } from "./communs.js";
import { motif, type Transaction } from "./transaction.js";

const estObjetJs = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function calques(tx: Transaction): ObjetCalque[] {
  return tx.objets().filter((o): o is ObjetCalque => o.classe === "calque");
}

function controlerCalqueUnique(tx: Transaction, c: ObjetCalque, chemin: string, cles: readonly string[] | null): void {
  for (const autre of calques(tx)) {
    if (autre.id === c.id) continue;
    if ((cles === null || cles.includes("nom")) && autre.params.nom === c.params.nom) {
      tx.refuser("precondition", `${chemin}.nom`, motif(nomObjet(c), `nom « ${c.params.nom} » déjà pris par ${nomObjet(autre)}`, "choisir un autre nom"), [c.id, autre.id]);
    }
    if ((cles === null || cles.includes("ordre")) && autre.params.ordre === c.params.ordre) {
      tx.refuser("precondition", `${chemin}.ordre`, motif(nomObjet(c), `ordre ${c.params.ordre} déjà pris par ${nomObjet(autre)}`, "choisir un ordre libre ou réordonner (calque.reordonner)"), [c.id, autre.id]);
    }
  }
}

const listeIds = (ids: readonly IdObjet[]) => (ids.length > 12 ? `${ids.slice(0, 12).join(", ")}… (${ids.length} au total)` : ids.join(", "));

// --- Calques ------------------------------------------------------------------

export const calqueCreer: Corps<"calque.creer"> = (tx, c) => {
  if (!controlerIdentifiantLibre(tx, c.params.id, "params.id")) return;
  const o = nouvelObjet("calque", c.params.id, sansCles(c.params, ["id", "niveauxPresence"]) as unknown as ObjetCalque["params"]);
  if ((c.params as { niveauxPresence?: unknown }).niveauxPresence !== undefined) {
    tx.refuser("parametre-invalide", "params.niveauxPresence", motif(nomObjet(o), "la présence par niveau est une donnée d'import", "retirer ce paramètre"));
    return;
  }
  controlerCalqueUnique(tx, o, "params", null);
  tx.mettre(o);
};

export const calqueModifier: Corps<"calque.modifier"> = (tx, c) => {
  const cibles = exigerCibles(tx, c.cibles, ["calque"]);
  if (!cibles) return;
  const mods = c.params.modifications;
  const cles = estObjetJs(mods) ? Object.keys(mods) : [];
  for (const o of cibles) {
    if (o.classe !== "calque") continue;
    const m = fusionnerModifications(tx, o, mods, "params.modifications", ["ordre", "niveauxPresence"]);
    if (!m) return;
    controlerCalqueUnique(tx, m, "params.modifications", cles);
    tx.mettre(m);
  }
};

export const calqueReordonner: Corps<"calque.reordonner"> = (tx, c) => {
  const ordre = c.params.ordre;
  const tous = calques(tx);
  const ids = new Set(tous.map((x) => x.id));
  if (!Array.isArray(ordre) || ordre.length !== tous.length || new Set(ordre).size !== ordre.length || !ordre.every((id) => ids.has(id))) {
    tx.refuser("parametre-invalide", "params.ordre", motif("Calques", `l'ordre doit citer exactement une fois chacun des ${tous.length} calques`, "fournir la liste complète des calques"));
    return;
  }
  ordre.forEach((id, i) => {
    const o = tx.objet(id);
    if (o?.classe === "calque" && o.params.ordre !== i) tx.mettre(fusionnerModifications(tx, o, { ordre: i }, "params.ordre") ?? o);
  });
};

export const calqueAffecter: Corps<"calque.affecter"> = (tx, c) => {
  const cibles = exigerCibles(tx, c.cibles, null);
  if (!cibles) return;
  const dest = tx.objet(c.params.calqueId);
  if (!dest || dest.classe !== "calque") {
    tx.refuser("precondition", "params.calqueId", motif(`Calque ${String(c.params.calqueId)}`, "inexistant", "choisir un calque existant"));
    return;
  }
  cibles.forEach((o, i) => {
    if (!descripteur(o.classe).admetCalque) tx.refuser("precondition", `cibles[${i}]`, motif(nomObjet(o), "cette classe n'a pas de calque", "retirer l'objet de la sélection"), [o.id]);
    else if (o.calqueId !== dest.id) tx.mettre({ ...o, calqueId: dest.id });
  });
};

export const calqueSupprimer: Corps<"calque.supprimer"> = (tx, c) => {
  const cibles = exigerCibles(tx, c.cibles, ["calque"], { min: 1, max: 1 });
  const k = cibles?.[0];
  if (!k || k.classe !== "calque") return;
  if (k.params.verrouille) {
    tx.refuser("calque-verrouille", "cibles[0]", motif(nomObjet(k), "calque verrouillé", "le déverrouiller d'abord (calque.modifier)"), [k.id]);
    return;
  }
  const portes = tx.objets().filter((o) => o.calqueId === k.id);
  const destId = c.params.calqueDestinationId;
  if (portes.length > 0) {
    if (destId === undefined) {
      tx.refuser("precondition", "params.calqueDestinationId", motif(nomObjet(k), `${portes.length} objet(s) sur ce calque : ${listeIds(portes.map((o) => o.id))}`, "indiquer un calque de destination"), portes.map((o) => o.id));
      return;
    }
    const dest = tx.objet(destId);
    if (!dest || dest.classe !== "calque" || dest.id === k.id) {
      tx.refuser("precondition", "params.calqueDestinationId", motif(`Calque ${destId}`, dest?.id === k.id ? "c'est le calque supprimé" : "inexistant", "choisir un autre calque existant"));
      return;
    }
    for (const o of portes) tx.mettre({ ...o, calqueId: destId });
  }
  supprimerObjet(tx, k.id);
};

// --- Groupes ------------------------------------------------------------------

const CLASSES_GROUPABLES = RELATIONS_ADMISES["appartient-a"]?.sources ?? [];

export const groupeCreer: Corps<"groupe.creer"> = (tx, c) => {
  const membres = exigerCibles(tx, c.cibles, CLASSES_GROUPABLES);
  if (!controlerIdentifiantLibre(tx, c.params.id, "params.id") || !membres) return;
  const id = c.params.id;
  let ok = true;
  membres.forEach((o, i) => {
    if (o.groupeId !== undefined) {
      ok = false;
      tx.refuser("precondition", `cibles[${i}]`, motif(nomObjet(o), `appartient déjà au groupe ${o.groupeId}`, "dissoudre ce groupe ou retirer l'objet de la sélection"), [o.id, o.groupeId]);
    }
  });
  if (!ok) return;
  tx.mettre(nouvelObjet("groupe", id, { ...(c.params.nom !== undefined ? { nom: c.params.nom } : {}), membres: membres.map((o) => o.id) }));
  for (const o of membres) {
    tx.mettre({ ...o, groupeId: id });
    tx.ajouterRelation({ type: "appartient-a", sourceId: o.id, cibleId: id, derivee: false });
  }
};

export const groupeDissoudre: Corps<"groupe.dissoudre"> = (tx, c) => {
  const groupes = exigerCibles(tx, c.cibles, ["groupe"]);
  if (!groupes) return;
  for (const g of groupes) {
    if (g.classe !== "groupe") continue;
    for (const id of g.params.membres) {
      const o = tx.objet(id);
      if (o && o.groupeId === g.id) {
        const { groupeId: _g, ...reste } = o;
        void _g;
        tx.mettre(reste as ObjetModele);
      }
    }
    supprimerObjet(tx, g.id);
  }
};

// --- Blocs (lot 5) --------------------------------------------------------------

const refuserBloc = (tx: Transaction) =>
  tx.refuser(
    "precondition",
    "type",
    motif("Bloc", "commande prévue au lot 5 : la classe « bloc » n'existe pas dans l'ontologie (version 1)", "utiliser un groupe (groupe.creer) d'ici là"),
  );
export const blocDefinir: Corps<"bloc.definir"> = (tx) => refuserBloc(tx);
export const blocPlacer: Corps<"bloc.placer"> = (tx) => refuserBloc(tx);

// --- Types ----------------------------------------------------------------------

function controlerDefinition(tx: Transaction, d: Record<string, unknown>, chemin: string): boolean {
  let ok = true;
  const refuser = (cle: string, cause: string, action: string) => {
    ok = false;
    tx.refuser("parametre-invalide", `${chemin}.${cle}`, motif(`Type ${String(d.id)}`, cause, action));
  };
  if (d.nom !== undefined && (typeof d.nom !== "string" || d.nom.trim() === "")) refuser("nom", "nom vide", "nommer le type");
  if (d.categorie !== undefined && typeof d.categorie !== "string") refuser("categorie", "catégorie non textuelle", "corriger la catégorie");
  if (d.dimensionsProposees !== undefined) {
    if (!estObjetJs(d.dimensionsProposees)) refuser("dimensionsProposees", "objet attendu", "corriger les dimensions proposées");
    else
      for (const [k, v] of Object.entries(d.dimensionsProposees)) {
        if (!["epaisseur", "hauteur", "largeur", "allege"].includes(k)) refuser(`dimensionsProposees.${k}`, `dimension « ${k} » inconnue`, "proposer epaisseur, hauteur, largeur ou allege");
        else {
          const e = controlerGrandeur(v, "m");
          if (e) {
            ok = false;
            tx.refuser("unite-invalide", `${chemin}.dimensionsProposees.${k}`, motif(`Type ${String(d.id)}`, e, "donner la valeur en mètres"));
          } else if (!((v as { value: number }).value > 0)) refuser(`dimensionsProposees.${k}`, "dimension ≤ 0", "donner une valeur strictement positive");
        }
      }
  }
  if (d.proprietes !== undefined) {
    if (!Array.isArray(d.proprietes)) refuser("proprietes", "liste attendue", "corriger les propriétés");
    else
      d.proprietes.forEach((p: unknown, i) => {
        const erreurs = [...controlerTracabilite(p), ...(estObjetJs(p) ? controlerPropriete(p as unknown as Propriete) : ["propriété attendue"])];
        if (erreurs.length > 0) refuser(`proprietes[${i}]`, erreurs.join(" ; "), "corriger la propriété");
      });
  }
  return ok;
}

export const typeDefinir: Corps<"type.definir"> = (tx, c) => {
  const d = c.params.definition as unknown;
  if (!estObjetJs(d)) {
    tx.refuser("parametre-invalide", "params.definition", motif("Type", "définition mal formée", "fournir `{ id, classe, nom, proprietes, provenance, statut }`"));
    return;
  }
  if (!(CLASSES_TYPEES as readonly unknown[]).includes(d.classe)) {
    tx.refuser("classe-inconnue", "params.definition.classe", motif(`Type ${String(d.id)}`, `classe « ${String(d.classe)} » non typée`, `choisir ${CLASSES_TYPEES.join(", ")}`));
    return;
  }
  const classe = d.classe as DefinitionType["classe"];
  if (typeof d.id !== "string" || d.id.trim() === "" || d.id === ID_NON_TYPE) {
    tx.refuser("parametre-invalide", "params.definition.id", motif(`Type ${String(d.id)}`, d.id === ID_NON_TYPE ? "identifiant réservé (non-type)" : "identifiant vide", "choisir un autre identifiant"));
    return;
  }
  const cle = cleDefinition(classe, d.id);
  const cat = tx.catalogue();
  if (cat.definitions[cle] !== undefined) {
    tx.refuser("precondition", "params.definition.id", motif(`Type ${d.id}`, `déjà défini pour la classe ${classe}`, "le modifier (type.modifier)"));
    return;
  }
  if (typeof d.nom !== "string") {
    tx.refuser("parametre-invalide", "params.definition.nom", motif(`Type ${d.id}`, "nom absent", "nommer le type"));
    return;
  }
  if (!Array.isArray(d.proprietes)) {
    tx.refuser("parametre-invalide", "params.definition.proprietes", motif(`Type ${d.id}`, "liste de propriétés absente (vide permise)", "fournir `proprietes: []`"));
    return;
  }
  const trace = controlerTracabilite(d);
  if (trace.length > 0 || (d.provenance !== "saisie" && d.provenance !== "regle")) {
    tx.refuser("parametre-invalide", "params.definition.provenance", motif(`Type ${d.id}`, trace.length > 0 ? trace.join(" ; ") : `provenance « ${String(d.provenance)} » réservée à l'import ou au calcul`, "saisir provenance « saisie » et un statut"));
    return;
  }
  if (!controlerDefinition(tx, d, "params.definition")) return;
  const version = cat.version + 1;
  const definition = { ...(d as unknown as DefinitionType), classeIfc: CLASSES_IFC[classe]?.entiteType ?? null, versionCatalogue: version };
  tx.definirCatalogue({ version, definitions: { ...cat.definitions, [cle]: definition } });
};

export const typeModifier: Corps<"type.modifier"> = (tx, c) => {
  const { classe, id, modifications } = c.params;
  const cat = tx.catalogue();
  const cle = cleDefinition(classe, id);
  const d = cat.definitions[cle];
  if (!d) {
    tx.refuser("precondition", "params.id", motif(`Type ${String(id)}`, `inconnu pour la classe ${String(classe)}`, "le définir d'abord (type.definir)"));
    return;
  }
  if (!estObjetJs(modifications)) {
    tx.refuser("parametre-invalide", "params.modifications", motif(`Type ${id}`, "modifications mal formées", "fournir un objet"));
    return;
  }
  const inconnues = Object.keys(modifications).filter((k) => !["nom", "categorie", "dimensionsProposees", "proprietes"].includes(k));
  if (inconnues.length > 0) {
    tx.refuser("parametre-invalide", `params.modifications.${inconnues[0] ?? ""}`, motif(`Type ${id}`, `champ(s) non modifiable(s) : ${inconnues.join(", ")}`, "modifier nom, categorie, dimensionsProposees ou proprietes"));
    return;
  }
  if (!controlerDefinition(tx, { id, ...modifications }, "params.modifications")) return;
  const version = cat.version + 1;
  tx.definirCatalogue({ version, definitions: { ...cat.definitions, [cle]: { ...d, ...modifications, versionCatalogue: version } as DefinitionType } });
};

// --- Propriétés et classification ----------------------------------------------

export const proprieteDefinir: Corps<"propriete.definir"> = (tx, c) => {
  const cibles = exigerCibles(tx, c.cibles, null);
  if (!cibles) return;
  const p = c.params;
  const objet = `Propriété « ${String(p.nom)} »`;
  if (typeof p.nom !== "string" || p.nom.trim() === "") {
    tx.refuser("parametre-invalide", "params.nom", motif("Propriété", "nom vide", "nommer la propriété"));
    return;
  }
  if (p.nom.startsWith(PREFIXE_PROPRIETE_IMPORT)) {
    tx.refuser("precondition", "params.nom", motif(objet, "propriété importée, conservée telle que la source la donne (R7)", "définir une propriété sous un autre nom"));
    return;
  }
  const trace = controlerTracabilite(p);
  if (trace.length > 0) {
    tx.refuser("parametre-invalide", "params", motif(objet, trace.join(" ; "), "donner provenance « saisie » et un statut"));
    return;
  }
  if (p.provenance !== "saisie" && p.provenance !== "regle") {
    tx.refuser("parametre-invalide", "params.provenance", motif(objet, `provenance « ${p.provenance} » réservée à l'import ou aux moteurs de calcul`, "donner provenance « saisie »"));
    return;
  }
  if (p.statut === "verifiee" && (typeof p.sourceId !== "string" || p.sourceId === "")) {
    tx.refuser("parametre-invalide", "params.sourceId", motif(objet, "statut « vérifiée » sans source", "citer la source (sourceId) ou choisir « déclarée »"));
    return;
  }
  let nouvelle: Propriete | null = null;
  if (p.retirer !== true) {
    if (p.valeur === undefined) {
      tx.refuser("parametre-invalide", "params.valeur", motif(objet, "valeur absente", "donner une valeur, ou `retirer: true`"));
      return;
    }
    if (typeof p.valeur === "number") {
      if (!estUnite(p.unite)) {
        tx.refuser("unite-invalide", "params.unite", motif(objet, `grandeur sans unité admise (« ${String(p.unite)} »)`, "préciser l'unité (m, m², m³, °…)"));
        return;
      }
    } else if (p.unite !== undefined) {
      tx.refuser("unite-invalide", "params.unite", motif(objet, "unité sans valeur numérique", "retirer l'unité"));
      return;
    }
    nouvelle = {
      nom: p.nom,
      valeur: p.valeur,
      provenance: p.provenance,
      statut: p.statut,
      ...(p.sourceId !== undefined ? { sourceId: p.sourceId } : {}),
      ...(p.note !== undefined ? { note: p.note } : {}),
      ...(p.unite !== undefined ? { unite: p.unite } : {}),
    };
    const erreurs = controlerPropriete(nouvelle);
    if (erreurs.length > 0) {
      tx.refuser("parametre-invalide", "params.valeur", motif(objet, erreurs.join(" ; "), "corriger la valeur"));
      return;
    }
  }
  cibles.forEach((o, i) => {
    if (descripteur(o.classe).parametres.some((d) => d.nom === p.nom)) {
      tx.refuser("precondition", "params.nom", motif(nomObjet(o), `« ${p.nom} » est un paramètre canonique de la classe ${o.classe}`, `le modifier par la commande de la classe`), [o.id]);
      return;
    }
    const idx = o.proprietes.findIndex((x) => x.nom === p.nom);
    if (nouvelle === null) {
      if (idx < 0) tx.refuser("precondition", `cibles[${i}]`, motif(nomObjet(o), `aucune propriété « ${p.nom} » à retirer`, "vérifier le nom"), [o.id]);
      else tx.mettre({ ...o, proprietes: o.proprietes.filter((_, j) => j !== idx) } as ObjetModele);
    } else {
      const proprietes = idx < 0 ? [...o.proprietes, nouvelle] : o.proprietes.map((x, j) => (j === idx ? (nouvelle as Propriete) : x));
      tx.mettre({ ...o, proprietes } as ObjetModele);
    }
  });
};

export const classificationAffecter: Corps<"classification.affecter"> = (tx, c) => {
  if (c.params.definitionId !== undefined) {
    tx.refuser(
      "precondition",
      "params.definitionId",
      motif("Classification", "une définition de type ne porte pas de classification dans l'ontologie (version 1)", "classer les occurrences (cibles) ; question remontée au chef de projet"),
    );
    return;
  }
  const cibles = exigerCibles(tx, c.cibles, null);
  if (!cibles) return;
  const k = c.params.classification as Partial<Classification> | undefined;
  if (!k || typeof k.systeme !== "string" || k.systeme.trim() === "" || typeof k.code !== "string" || k.code.trim() === "" || (k.libelle !== undefined && typeof k.libelle !== "string")) {
    tx.refuser("parametre-invalide", "params.classification", motif("Classification", "système et code non vides attendus", "compléter la classification"));
    return;
  }
  if (k.provenance !== "saisie") {
    tx.refuser("parametre-invalide", "params.classification.provenance", motif("Classification", `provenance « ${String(k.provenance)} » réservée à l'import`, "donner provenance « saisie »"));
    return;
  }
  const classification = k as Classification;
  cibles.forEach((o, i) => {
    if (CLASSES_IFC[o.classe] === null || descripteur(o.classe).ontologie === "projet") {
      tx.refuser("precondition", `cibles[${i}]`, motif(nomObjet(o), `classe ${o.classe} non classifiable`, "retirer l'objet de la sélection"), [o.id]);
      return;
    }
    const actuelles = o.classifications ?? [];
    const idx = actuelles.findIndex((x) => x.systeme === classification.systeme);
    const classifications = idx < 0 ? [...actuelles, classification] : actuelles.map((x, j) => (j === idx ? classification : x));
    tx.mettre({ ...o, classifications } as ObjetModele);
  });
};
