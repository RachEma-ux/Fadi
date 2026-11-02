/**
 * Lot W3-D (X.1-06) — commandes « Fusionner une variante » et « Annuler la dernière fusion » : règle d'or (icône propre,
 * barre, raccourci de la réserve du lot, atteintes au clavier), aucun choix de conflit par défaut, corps d'application
 * fidèle à l'aperçu accepté, refus du serveur dits en français, textes traduits (en.json).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import dico from "../../../lib/i18n/en.json";
import { Traducteur } from "../../../lib/i18n/traduire";
import type { StudioConflitFusion, StudioFusionLue } from "../../../lib/api";
import { CATALOGUE, rechercher } from "../planche2d/catalogue";
import { cibleRaccourci, COMMANDES_EDITEUR, commandesDeBarre, RACCOURCIS_RESERVES } from "../planche2d/raccourcis";
import { commandeDisponible } from "../variante/disponibilite";
import { domaineExecution } from "../domaines/domaines";
import { choixValables, conflitsSansChoix, corpsFusion, detailConflit, FAMILLES_FUSION, libelleCle, messageRefusFusion, NATURES_REFERENCES, raisonBlocage, TYPES_CONFLITS } from "./fusion-ui";

const conflit = (id: string, extra: Partial<StudioConflitFusion> = {}): StudioConflitFusion => ({ id, type: "modification-concurrente", cles: ["objects:a"], propriete: "start", etats: { base: "line", source: "line", cible: "line" }, resolution: null, ...extra });
const lu = (conflits: StudioConflitFusion[], extra: Partial<StudioFusionLue["apercu"]> = {}, canWrite = true): StudioFusionLue => ({
  cible: { variantId: "v", revisionId: "r-c" }, source: { variantId: "b", revisionId: "r-s" }, ancetre: { variantId: "v", revisionId: "r1" }, canWrite,
  apercu: { schema: "studio-fusion/1", changementsSource: [], changementsCible: [], appliques: [{ cle: "objects:b1", etat: "ajoute", origine: "source" }], conflits, nonResolus: conflits.filter((c) => !c.resolution).map((c) => c.id), resolutionsInconnues: [], provisoire: false, valide: true, erreur: null, empreinte: "e".repeat(64), aFusionner: true, ...extra },
});

describe("Fusion de variantes — commandes de l'éditeur (lot W3-D)", () => {
  it("W3-D [+] « Fusionner une variante » (Ctrl+F10) et « Annuler la dernière fusion » (Ctrl+F11) : icône propre, barre Édition, raccourci libre, trouvées par recherche, ouvertes par-dessus le domaine", () => {
    for (const [id, raccourci, icone, libelle] of [["fusionner-variantes", "Ctrl+F10", "studio-merge-variants", "Fusionner une variante"], ["annuler-fusion", "Ctrl+F11", "studio-merge-undo", "Annuler la dernière fusion"]] as const) {
      expect(COMMANDES_EDITEUR.find((c) => c.id === id)).toMatchObject({ libelleFR: libelle, raccourci, iconeSymbolique: icone, groupe: "edition", ecrit: true });
      expect(cibleRaccourci(raccourci)).toEqual({ type: "commande", id });
      expect(RACCOURCIS_RESERVES).not.toContain(raccourci);
      expect(COMMANDES_EDITEUR.filter((c) => c.raccourci === raccourci || c.autres?.includes(raccourci))).toHaveLength(1);
      expect(COMMANDES_EDITEUR.filter((c) => c.iconeSymbolique === icone)).toHaveLength(1);
      expect(commandesDeBarre("edition").map((c) => c.id)).toContain(id);
      expect(rechercher(libelle)[0]).toMatchObject({ identifiant: id, barre: "edition", icone, raccourcis: [raccourci] });
      expect(CATALOGUE.find((x) => x.identifiant === id)).toMatchObject({ droit: "ecriture", contextes: ["planche-2d", "vue-3d", "feuille"] });
      expect(domaineExecution({ type: "commande", id }, "bim")).toBe("bim");
    }
    // Icônes tracées (aucune réutilisée) dans le composant commun.
    const icones = readFileSync(new URL("../../../components/Icon.tsx", import.meta.url), "utf8");
    expect(icones).toMatch(/"studio-merge-variants": "M/);
    expect(icones).toMatch(/"studio-merge-undo": "M/);
  });

  it("W3-D [−] en lecture seule (lecteur, révision historique), les deux commandes sont indisponibles ; le serveur reste seul juge", () => {
    const c = COMMANDES_EDITEUR.find((x) => x.id === "fusionner-variantes")!;
    const etat = { writable: false, brouillon: null, drawing: null, trace: null, suite: [], selectionIds: [], tool: "studio.dessin.selection" as const, canSave: false, largeurVue: 20 };
    expect(commandeDisponible(c, etat)).toBe(false);
    expect(commandeDisponible(COMMANDES_EDITEUR.find((x) => x.id === "annuler-fusion")!, etat)).toBe(false);
    expect(commandeDisponible(c, { ...etat, writable: true })).toBe(true);
    expect(raisonBlocage(lu([]), {}, false)).toBeNull();
    expect(raisonBlocage(lu([], {}, false), {}, false)).toBe("Vous ne pouvez pas modifier cette variante : la fusion n’est pas proposée.");
  });
});

describe("Fusion de variantes — choix explicites et corps d'application", () => {
  it("W3-D [−] aucun conflit n'a de choix par défaut : la fusion reste bloquée tant qu'un conflit n'est pas tranché ; brouillon non enregistré bloquant", () => {
    const cs = [conflit("modification:objects:a/start"), conflit("suppression:objects:l2", { type: "suppression-modification", supprimeDans: "source", propriete: null })];
    expect(conflitsSansChoix(cs, {})).toEqual(["modification:objects:a/start", "suppression:objects:l2"]);
    expect(raisonBlocage(lu(cs), {}, false)).toBe("2 conflit(s) sans choix : gardez la source ou la cible pour chacun.");
    expect(raisonBlocage(lu(cs), { "modification:objects:a/start": "source" }, false)).toMatch(/^1 conflit/);
    const tous = { "modification:objects:a/start": "source", "suppression:objects:l2": "cible" } as const;
    // Choix complets mais aperçu encore calculé sans eux : à relancer.
    expect(raisonBlocage(lu(cs), tous, false)).toBe("Aperçu à relancer avec vos choix.");
    expect(raisonBlocage(lu(cs.map((c) => ({ ...c, resolution: tous[c.id as keyof typeof tous] }))), tous, false)).toBeNull();
    expect(raisonBlocage(lu([]), {}, true)).toBe("Enregistrez ou annulez d’abord les modifications en cours de cette variante.");
    expect(raisonBlocage(lu([], { valide: false, empreinte: null }), {}, false)).toBe("Le résultat de la fusion serait invalide : choisissez d’autres versions.");
    expect(raisonBlocage(lu([], { aFusionner: false, appliques: [] }), {}, false)).toBe("La fusion ne changerait rien à cette variante.");
    expect(raisonBlocage(null, {}, false)).toBe("Choisissez la variante source et lancez l’aperçu.");
  });

  it("W3-D [+] le corps d'application reprend l'aperçu accepté (têtes, empreinte exacte) et seulement les choix qui désignent un conflit", () => {
    const cs = [conflit("modification:objects:a/start", { resolution: "source" })];
    const corps = corpsFusion(lu(cs), { "modification:objects:a/start": "source", "collision:objects:zz": "cible" }, "fusion-1");
    expect(corps).toEqual({ requestId: "fusion-1", sourceVariantId: "b", sourceRevisionId: "r-s", baseRevisionId: "r-c", empreinte: "e".repeat(64), resolutions: { "modification:objects:a/start": "source" } });
    expect(corpsFusion(lu([]), {}, "f2")).not.toHaveProperty("resolutions");
    expect(choixValables(cs, { x: "source" })).toEqual({});
  });

  it("W3-D [−] refus du serveur dits en français (droits, archive, têtes changées, aperçu périmé, conflits, rien à fusionner, aucun ancêtre)", () => {
    expect(messageRefusFusion(403, { error: "forbidden" })).toBe("Fusion refusée par le serveur : vous ne pouvez pas modifier cette variante.");
    expect(messageRefusFusion(423, { error: "locked" })).toMatch(/autre compte/);
    for (const [code, attendu] of [["archived", /archivée/], ["stale_revision", /relancez l’aperçu/], ["source_changee", /source a changé/], ["apercu_perime", /aperçu accepté/], ["conflits_non_resolus", /explicitement/], ["rien_a_fusionner", /rien/], ["fusion_sans_ancetre", /aucune révision commune/], ["pas_une_fusion", /rien à annuler/]] as const) {
      expect(messageRefusFusion(409, { error: code }), code).toMatch(attendu);
    }
    expect(messageRefusFusion(500, null)).toBe("Fusion non confirmée : relancez l’aperçu avant de réessayer.");
  });

  it("W3-D [+] libellés : familles, conflits et références en français ; identifiants du document intacts", () => {
    expect(libelleCle("architecture:o2")).toEqual({ famille: "Élément architectural", id: "o2" });
    expect(libelleCle("systemeProjet")).toEqual({ famille: "Système de projet", id: null });
    expect(detailConflit(conflit("reference:hote:architecture:o2>architecture:m1", { type: "reference-cassee", reference: { de: "architecture:o2", vers: "architecture:m1", nature: "hote" } }))).toBe("Lien rompu (mur hôte) : les deux éléments prennent la version choisie.");
    expect(detailConflit(conflit("suppression:objects:l2", { type: "suppression-modification", supprimeDans: "cible" }))).toBe("Supprimé dans la cible, modifié dans la source.");
  });

  it("W3-D [+] chaque texte de la boîte et des règles a sa traduction anglaise (en.json)", () => {
    const t = new Traducteur(dico as Record<string, string>);
    const textes = [
      ...Object.values(FAMILLES_FUSION), ...Object.values(TYPES_CONFLITS), ...Object.values(NATURES_REFERENCES),
      "Fusionner une variante", "Annuler la dernière fusion", "Variante source", "Aperçu", "Changements apportés à cette variante", "Aucun changement.", "Aucun conflit.",
      "Garder la source", "Garder cette variante", "Fusionner dans cette variante", "Ouvrir la nouvelle révision", "Conflits : 3",
      "Ancêtre commun : révision 1234abcd. Source : 2 changement(s) ; cette variante : 1 changement(s).",
      "2 conflit(s) sans choix : le document montré garde cette variante tant que vous n’avez pas choisi.",
      "Fusion enregistrée : nouvelle révision 1234abcd de cette variante. Elle s’annule par « Annuler la dernière fusion ».",
      "Fusion annulée : nouvelle révision 1234abcd, au document d’avant la fusion.",
      detailConflit(conflit("x")), detailConflit(conflit("y", { type: "collision-identifiant", propriete: null })), detailConflit(conflit("z", { type: "combinaison-invalide", propriete: null })),
      raisonBlocage(null, {}, false)!, raisonBlocage(lu([conflit("a")]), {}, false)!,
      ...["archived", "stale_revision", "source_changee", "apercu_perime", "conflits_non_resolus", "resolutions_inconnues", "fusion_invalide", "rien_a_fusionner", "fusion_sans_ancetre", "fusion_ancetre_ambigu", "pas_une_fusion", "chemin_ecriture", "x"].map((e) => messageRefusFusion(409, { error: e })),
      messageRefusFusion(403, {}), messageRefusFusion(423, {}), "Fusion d’une variante", "Annulation d’une fusion",
    ];
    // Un texte identique dans les deux langues (« Annotation ») est au dictionnaire, sous sa propre forme.
    const manquants = textes.filter((x) => t.traduire(x) === x && !(x in dico));
    expect(manquants).toEqual([]);
  });
});
