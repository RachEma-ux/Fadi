/**
 * Chantier Axes, lot AX-3 : repères enregistrés (AX08, AX09), rappel par scène (AX14), suppression d'un repère cité.
 */
import { describe, expect, it } from "vitest";
import type { Scene } from "./annotations.js";
import { lireModelePlanche } from "./delta.js";
import { type Modele, modeleVide, modifierAnnotations, redimensionner } from "./geometrie-libre.js";
import {
  captureDuContexte,
  contexteDeScene,
  contexteEnregistre,
  dupliquerRepere,
  enregistrerRepere,
  etatRepereActif,
  mettreAJourRepere,
  referencesRepere,
  renommerRepere,
  reperesEnregistres,
  supprimerRepere,
} from "./reperes-enregistres.js";
import { CONTEXTE_MODELE, REPERE_DU_MODELE, contexteTemporaire, deplacerOrigine, pivoterRepere } from "./reperes.js";
import { v3 } from "./vecteur.js";

const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};
const facade = () => {
  const r = pivoterRepere({ ...REPERE_DU_MODELE, origine: v3(10, 0, 0) }, "z", "local", Math.PI / 6);
  if (!r.ok) throw new Error();
  return r.repere;
};
const scene = (m: Modele, s: Omit<Scene, "id">): { modele: Modele; id: string } => {
  const r = modifierAnnotations(m, (a, id) => {
    const k = id("v");
    a.scenes[k] = { ...s, id: k };
    return k;
  });
  return { modele: r.modele, id: r.extra };
};

describe("AX-3 — repères enregistrés", () => {
  it("AX08 (modèle) : enregistrer, renommer, mettre à jour — identifiant stable, révision suivante, relu à l'identique", () => {
    const e1 = ok(enregistrerRepere(modeleVide(), "  Façade sud  ", facade()));
    const r1 = e1.modele.annotations!.reperes![e1.id]!;
    expect(e1.id).toMatch(/^r\d+$/);
    expect(r1).toMatchObject({ nom: "Façade sud", revision: 1, version: 1, source: { mode: "instantane" } });
    const e2 = ok(renommerRepere(e1.modele, e1.id, "Aile est"));
    // Renommer ne change pas la révision : le nom est une étiquette, pas la définition.
    expect(e2.modele.annotations!.reperes![e1.id]).toMatchObject({ nom: "Aile est", revision: 1 });
    const r3 = ok(deplacerOrigine(facade(), v3(12, 1, 0)));
    const e3 = ok(mettreAJourRepere(e2.modele, e1.id, r3.repere));
    expect(e3.modele.annotations!.reperes![e1.id]).toMatchObject({ nom: "Aile est", revision: 2, origine: { x: 12, y: 1, z: 0 } });
    // Persistance : relu depuis le JSON du document (redémarrage), identifiant, base, nom et révision intacts.
    const relu = lireModelePlanche(JSON.parse(JSON.stringify(e3.modele)));
    expect(relu?.annotations?.reperes?.[e1.id]).toEqual(JSON.parse(JSON.stringify(e3.modele.annotations!.reperes![e1.id])));
  });

  it("refus : nom vide, base invalide, repère absent — le modèle n'est pas touché", () => {
    expect(enregistrerRepere(modeleVide(), "   ", facade())).toMatchObject({ ok: false });
    expect(enregistrerRepere(modeleVide(), "X", { ...facade(), x: v3(2, 0, 0) })).toMatchObject({ ok: false });
    expect(renommerRepere(modeleVide(), "r9", "X")).toMatchObject({ ok: false });
    expect(mettreAJourRepere(modeleVide(), "r9", facade())).toMatchObject({ ok: false });
  });

  it("dupliquer : nouvel identifiant, révision 1 ; deux noms identiques restent deux repères", () => {
    const e = ok(enregistrerRepere(modeleVide(), "Toiture", facade()));
    const d = ok(dupliquerRepere(e.modele, e.id, "Toiture"));
    expect(d.id).not.toBe(e.id);
    expect(reperesEnregistres(d.modele).map((r) => [r.nom, r.revision])).toEqual([["Toiture", 1], ["Toiture", 1]]);
  });

  it("supprimer un repère cité par une scène : refusé sans résolution, « détacher » garde l'instantané de la scène", () => {
    const e = ok(enregistrerRepere(modeleVide(), "Façade sud", facade()));
    const ctx = contexteEnregistre(CONTEXTE_MODELE, e.modele.annotations!.reperes![e.id]!);
    const s = scene(e.modele, { nom: "Vue façade", position: v3(0, -10, 2), cible: v3(0, 0, 0), champDeVision: 35, projection: "perspective", repere: captureDuContexte(ctx, ctx.repere!) });
    expect(referencesRepere(s.modele, e.id).map((x) => x.id)).toEqual([s.id]);
    expect(supprimerRepere(s.modele, e.id)).toMatchObject({ ok: false });
    const d = ok(supprimerRepere(s.modele, e.id, "detacher"));
    expect(d.modele.annotations?.reperes?.[e.id]).toBeUndefined();
    const sc = d.modele.annotations!.scenes![s.id]!;
    expect(sc.repere?.id).toBeUndefined();
    expect(sc.repere?.instantane).toEqual(ctx.repere);
    // Un repère non cité se supprime directement.
    const libre = ok(enregistrerRepere(modeleVide(), "Libre", facade()));
    expect(ok(supprimerRepere(libre.modele, libre.id)).modele.annotations?.reperes).toBeUndefined();
  });
});

describe("AX-3 — état du repère actif (« Modifié »)", () => {
  it("enregistré → modifié après une rotation ; périmé si la définition change ; absent si supprimée", () => {
    const e = ok(enregistrerRepere(modeleVide(), "Façade sud", facade()));
    const r = e.modele.annotations!.reperes![e.id]!;
    const actif = contexteEnregistre(CONTEXTE_MODELE, r);
    expect(etatRepereActif(actif, e.modele)).toBe("enregistre");
    const pivote = ok(pivoterRepere(actif.repere!, "z", "local", 0.1));
    const modifie = contexteTemporaire(actif, pivote.repere);
    expect(modifie.source).toEqual({ genre: "temporaire", depuis: { id: e.id, revision: 1 } });
    expect(etatRepereActif(modifie, e.modele)).toBe("modifie");
    const maj = ok(mettreAJourRepere(e.modele, e.id, ok(deplacerOrigine(facade(), v3(0, 0, 0))).repere));
    expect(etatRepereActif(actif, maj.modele)).toBe("perime");
    const sup = ok(supprimerRepere(e.modele, e.id));
    expect(etatRepereActif(actif, sup.modele)).toBe("absent");
    expect(etatRepereActif(modifie, sup.modele)).toBe("temporaire");
    expect(etatRepereActif(CONTEXTE_MODELE, e.modele)).toBe("modele");
  });
});

describe("AX14 (modèle) — rappel du repère par une scène", () => {
  it("avec capture : repère enregistré à la révision capturée ; définition changée → instantané de la scène, signalé périmé", () => {
    const e = ok(enregistrerRepere(modeleVide(), "Façade sud", facade()));
    const actif = { ...contexteEnregistre(CONTEXTE_MODELE, e.modele.annotations!.reperes![e.id]!), plan: "xz" as const, verrou: true };
    const cap = captureDuContexte(actif, actif.repere!);
    const r1 = contexteDeScene(CONTEXTE_MODELE, cap, e.modele)!;
    expect(r1.perime).toBe(false);
    expect(r1.contexte).toMatchObject({ plan: "xz", verrou: true, source: { genre: "enregistre", id: e.id, revision: 1 } });
    const maj = ok(mettreAJourRepere(e.modele, e.id, REPERE_DU_MODELE));
    const r2 = contexteDeScene(CONTEXTE_MODELE, cap, maj.modele)!;
    expect(r2.perime).toBe(true);
    expect(r2.contexte.source.genre).toBe("temporaire");
    expect(r2.contexte.repere).toEqual(actif.repere);
  });

  it("instantané invalide (document altéré) : aucun contexte rappelé", () => {
    expect(contexteDeScene(CONTEXTE_MODELE, { instantane: { ...REPERE_DU_MODELE, z: v3(0, 0, -1) }, plan: "xy", verrou: false }, modeleVide())).toBeNull();
  });

  it("mise à l'échelle du modèle : origine des repères enregistrés et des captures de scène suivent la géométrie", () => {
    const e = ok(enregistrerRepere(modeleVide(), "Façade sud", facade()));
    const actif = contexteEnregistre(CONTEXTE_MODELE, e.modele.annotations!.reperes![e.id]!);
    const s = scene(e.modele, { nom: "V", position: v3(0, -10, 2), cible: v3(0, 0, 0), champDeVision: 35, projection: "perspective", repere: captureDuContexte(actif, actif.repere!) });
    const m2 = redimensionner(s.modele, 2).modele;
    expect(m2.annotations!.reperes![e.id]!.origine).toEqual(v3(20, 0, 0));
    expect(m2.annotations!.scenes![s.id]!.repere!.instantane.origine).toEqual(v3(20, 0, 0));
  });
});
