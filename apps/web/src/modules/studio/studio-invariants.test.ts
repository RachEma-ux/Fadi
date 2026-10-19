// Suite `studio-invariants` — interface (X.2-01) : invariants INV-011, INV-014 et INV-015 du référentiel technique
// (REF-02, STUDIO-RT-001 §2.4) qui se prouvent dans les modules purs de l'éditeur (brouillon hors ligne, état de connexion,
// profils et catalogue d'outils, disponibilité hors connexion). Ni DOM, ni IndexedDB, ni réseau. Les volets modèle et
// serveur sont dans `packages/atelier-model/src/studio/studio-invariants.test.ts` et
// `apps/api/src/routes/studio-invariants.test.ts` ; la table de traçabilité générée et vérifiée est
// `docs/ai-team/reports/claude-v9-x2/INVARIANTS.md` (titres `INV-xxx [+]` / `INV-xxx [−]`).
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, STUDIO_TOOLS, type StudioCommand } from "@parcours/atelier-model";
import type { StudioContext } from "../../lib/api";
import { annulerBrouillon, appliquerBrouillon, creerBrouillon, documentBrouillon } from "./planche2d/brouillon";
import { etatHorsLigne } from "./hors-ligne/etat";
import { lireHorsLigne, reporterSurTete, versHorsLigne } from "./hors-ligne/persistance";
import { CATALOGUE, filtrerCatalogue, rechercher } from "./planche2d/catalogue";
import { choisirProfil, outilsDuProfil, PREFERENCES_DEFAUT, PROFILS_METIER, visibleDansBarres, type PreferencesOutils } from "./planche2d/profils";
import { outilsHorsConnexion } from "./chargement/cache-hors-ligne";

const ligne = (id: string, y: number): StudioCommand => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x: 0, y }, end: { x: 1, y } } });
const deplacer = (id: string, dy: number): StudioCommand => ({ toolId: "studio.dessin.deplacer", params: { id, dx: 0, dy } });
const contexte = (revisionId: string, document = newStudioDocument("doc")): StudioContext => ({
  study: { id: "s", name: "Étude", projectId: "p" }, variant: { id: "v", name: "Variante", studyId: "s", headRevisionId: revisionId },
  revision: { id: revisionId, parentRevisionId: null, document }, canWrite: true,
});

describe("INV-011 — les annulations concurrentes ne détruisent pas silencieusement le travail d'un autre acteur", () => {
  const base = applyStudioCommands(newStudioDocument("doc"), [ligne("a", 0)]);
  const tete = applyStudioCommands(base, [deplacer("a", 2)]);
  it("INV-011 [+] le brouillon reporté sur la tête d'autrui s'annule sans retirer le changement d'autrui", () => {
    const r = reporterSurTete(tete, [[ligne("b", 5)]], base);
    expect(r.ok && r.chevauchements).toEqual([]);
    if (!r.ok) throw new Error("report refusé");
    expect(documentBrouillon(annulerBrouillon(r.brouillon))).toEqual(tete);
  });
  it("INV-011 [−] un pas local qui retire l'objet modifié par autrui est signalé au report (chevauchement), jamais appliqué en silence", () => {
    const r = reporterSurTete(tete, [[{ toolId: "studio.dessin.supprimer", params: { ids: ["a"] } }]], base);
    expect(r).toMatchObject({ ok: true, chevauchements: ["objects:a"] });
  });
});

describe("INV-014 — le mode hors connexion différencie travail local, confirmation serveur et droits à revérifier", () => {
  it("INV-014 [+] trois états distincts : travail local conservé, enveloppes en attente de confirmation, confirmé en ligne", () => {
    expect(etatHorsLigne({ enLigne: false, enAttente: 0, conflit: false, conserve: true, depuisCache: true }).code).toBe("hors-ligne");
    expect(etatHorsLigne({ enLigne: false, enAttente: 2, conflit: false, conserve: true, depuisCache: false })).toMatchObject({ code: "en-attente", texte: "2 en attente" });
    expect(etatHorsLigne({ enLigne: true, enAttente: 0, conflit: false, conserve: false, depuisCache: false })).toMatchObject({ code: "en-ligne", detail: null });
  });
  it("INV-014 [−] une enveloppe non accusée n'est jamais montrée confirmée ; un brouillon d'un autre compte n'est ni relu ni rejoué", () => {
    // En ligne, une enveloppe restant à accuser : « en attente », pas « en ligne ».
    expect(etatHorsLigne({ enLigne: true, enAttente: 1, conflit: false, conserve: true, depuisCache: false }).code).toBe("en-attente");
    // Conflit serveur : prime sur tout, rien n'est écrasé.
    expect(etatHorsLigne({ enLigne: true, enAttente: 1, conflit: true, conserve: true, depuisCache: false }).code).toBe("conflit");
    const b = appliquerBrouillon(creerBrouillon(newStudioDocument("doc")), [ligne("a", 0)]);
    const json = JSON.stringify(versHorsLigne("u1", contexte("r1"), b, null, 0, null));
    expect(lireHorsLigne(json, "u1").pas).toEqual([[ligne("a", 0)]]);
    expect(() => lireHorsLigne(json, "u2")).toThrow(/autre utilisateur/);
  });
});

describe("INV-015 — un outil masqué reste retrouvable s'il est autorisé, et n'est pas désinstallé implicitement", () => {
  const prefs = (profil: PreferencesOutils["profil"]): PreferencesOutils => ({ ...PREFERENCES_DEFAUT, profil });
  it("INV-015 [+] chaque outil masqué par un profil métier reste au catalogue et se retrouve par son nom", () => {
    for (const p of PROFILS_METIER) {
      const masques = STUDIO_TOOLS.filter((t) => !visibleDansBarres(prefs(`metier:${p.id}`), t.toolId));
      expect(masques.length, p.id).toBeGreaterThan(0);
      for (const t of masques) {
        expect(rechercher(t.libelleFR).some((e) => e.identifiant === t.toolId), `${p.id} : ${t.toolId}`).toBe(true);
        expect(filtrerCatalogue(CATALOGUE, {}, { favoris: [], groupes: [], autorise: () => true }).some((e) => e.identifiant === t.toolId)).toBe(true);
      }
    }
  });
  it("INV-015 [−] changer de profil ne retire rien des listes ; hors connexion, un outil sans moteur est indiqué indisponible, jamais retiré", () => {
    const perso: PreferencesOutils = { ...PREFERENCES_DEFAUT, profil: "personnel", favoris: ["studio.dessin.cote"], personnel: ["studio.dessin.ligne", "studio.objet.extruder"], groupes: [{ id: "g", nom: "Mes outils", outils: ["studio.dessin.arc"] }] };
    let p = perso;
    for (const profil of ["standard", "metier:cotation", "personnel"] as const) p = choisirProfil(p, profil);
    expect(p).toEqual(perso);
    expect(outilsDuProfil(choisirProfil(perso, "standard"))).toBeNull();
    // Cache du build purgé : tous les outils sont listés indisponibles (aucun n'est retiré de la liste).
    const outils = STUDIO_TOOLS.map((t) => ({ toolId: t.toolId, groupe: t.groupe }));
    const r = outilsHorsConnexion(outils, { moteurs: {}, manquants: {}, coquille: false, raison: "cache-purge" } as never)!;
    expect(r.disponibles.length + r.indisponibles.length).toBe(outils.length);
    expect(r.indisponibles.map((t) => t.toolId)).toEqual(outils.map((t) => t.toolId));
  });
});
