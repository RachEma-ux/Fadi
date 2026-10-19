// Contrat de commandes commun du Studio (A.5-01 à A.5-11), côté éditeur : garde d'architecture (lecture statique du
// code) et règles pures du brouillon, de la prévisualisation, du report et de la révision courante.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, STUDIO_CONTRACT, type StudioCommand } from "@parcours/atelier-model";
import type { StudioContext } from "../../lib/api";
import { enveloppeSuivante, planEnvoi } from "./import/envoi";
import { annulerBrouillon, apercuBrouillon, appliquerBrouillon, commandesEnAttente, creerBrouillon, documentBrouillon, peutAnnuler } from "./planche2d/brouillon";
import { identifiantsCites, reporterSurTete } from "./hors-ligne/persistance";
import { invalidationsApresEngagement, lectureApplicable } from "./variante/revision-courante";

const ICI = fileURLToPath(new URL(".", import.meta.url));
function sources(dossier: string): { chemin: string; texte: string }[] {
  const out: { chemin: string; texte: string }[] = [];
  for (const nom of readdirSync(dossier)) {
    const p = join(dossier, nom);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.(ts|tsx)$/.test(nom) && !/\.test\.ts$/.test(nom)) out.push({ chemin: relative(ICI, p).replaceAll("\\", "/"), texte: readFileSync(p, "utf8") });
  }
  return out;
}
const STUDIO = sources(ICI);
const fichiersAvec = (motif: RegExp) => STUDIO.filter((f) => motif.test(f.texte)).map((f) => f.chemin).sort();

describe("A.5-01 — aucun geste n'écrit le document hors du contrat de commandes", () => {
  it("un seul point d'envoi des enveloppes : l'enregistrement", () => {
    expect(fichiersAvec(/api\.studioCommands\(/)).toEqual(["variante/useEnregistrement.ts"]);
    // Aucun appel réseau direct vers la route des commandes depuis le module.
    expect(fichiersAvec(/\/commands["'`]/)).toEqual([]);
  });

  it("le brouillon ne change que par le modèle : appliquer, annuler, rétablir, recréer depuis le serveur ou restaurer", () => {
    expect(fichiersAvec(/setBrouillon\(/)).toEqual(["VariantWorkspace.tsx", "hors-ligne/useChargementVariante.ts"]);
    const admis = /^setBrouillon\((creerBrouillon\(|annulerBrouillon\(|retablirBrouillon\(|next\)|rebase\)|b\)|h \? restaurer\()/;
    for (const f of STUDIO) {
      for (const m of f.texte.matchAll(/setBrouillon\([^\n]{0,40}/g)) {
        if (m[0].startsWith("setBrouillon(b: Brouillon")) continue; // déclaration de type
        expect(admis.test(m[0]), `${f.chemin} : ${m[0]}`).toBe(true);
      }
    }
    // `next` vient toujours d'`appliquerBrouillon` (commandes validées par le modèle).
    const ws = STUDIO.find((f) => f.chemin === "VariantWorkspace.tsx")!.texte;
    expect(ws).toMatch(/const next = appliquerBrouillon\(brouillon, cs\);\s*setBrouillon\(next\);/);
  });

  it("les panneaux 2D / 3D qui produisent des commandes les remettent tous à `apply`", () => {
    const ws = STUDIO.find((f) => f.chemin === "VariantWorkspace.tsx")!.texte;
    const raccords = [...ws.matchAll(/surCommandes=\{([^}]*)\}/g)].map((m) => m[1]);
    expect(raccords.length).toBeGreaterThanOrEqual(3);
    expect(new Set(raccords)).toEqual(new Set(["apply"]));
  });

  it("aucune mutation directe d'une liste du document dans le module", () => {
    const mutation = /\b(?:doc|drawing|document|present|current)\??\.(?:objects|layers|dimensions|annotations|architecture|solides|scenes|proprietes)\s*(?:=[^=>]|\.(?:push|splice|pop|shift|unshift|sort|reverse)\()/;
    expect(fichiersAvec(mutation)).toEqual([]);
  });

  it("le modèle n'est appliqué hors du brouillon que pour la prévisualisation", () => {
    expect(fichiersAvec(/\bapplyStudioCommands\(/)).toEqual(["planche2d/brouillon.ts"]);
  });
});

const ligne = (id: string, x: number): StudioCommand => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x, y: 0 }, end: { x: x + 1, y: 0 } } });
const deplacer = (id: string, dx: number): StudioCommand => ({ toolId: "studio.dessin.deplacer", params: { id, dx, dy: 0 } });
const contexte = (revisionId: string, document = newStudioDocument("doc")): StudioContext => ({
  study: { id: "s", name: "Étude", projectId: "p" }, variant: { id: "v", name: "Variante", studyId: "s", headRevisionId: revisionId },
  revision: { id: revisionId, parentRevisionId: null, document }, canWrite: true,
});

describe("A.5-03 — prévisualisation séparée de la modification confirmée", () => {
  it("l'aperçu ne crée aucun pas, aucune commande en attente, et laisse le document intact", () => {
    const b = appliquerBrouillon(creerBrouillon(newStudioDocument("doc")), [ligne("a", 0)]);
    const doc = documentBrouillon(b);
    const avant = JSON.stringify(doc);
    const apercu = apercuBrouillon(doc, [deplacer("a", 3)]);
    expect(apercu?.objects[0]).toMatchObject({ start: { x: 3 } });
    expect(JSON.stringify(documentBrouillon(b))).toBe(avant);
    expect(b.pas).toHaveLength(1);
    expect(commandesEnAttente(b)).toEqual([ligne("a", 0)]);
  });
  it("un aperçu refusé par le modèle ou vide ne montre rien", () => {
    const doc = newStudioDocument("doc");
    expect(apercuBrouillon(doc, [deplacer("inconnu", 1)])).toBeNull();
    expect(apercuBrouillon(doc, [])).toBeNull();
  });
});

describe("A.5-07 — historique local et enveloppes : mêmes commandes, sans réécriture", () => {
  it("les pas du brouillon partent tels quels, dans l'ordre, sur la révision de base", () => {
    let b = creerBrouillon(newStudioDocument("doc"));
    b = appliquerBrouillon(b, [ligne("a", 0), ligne("b", 2)]);
    b = appliquerBrouillon(b, [deplacer("a", 1)]);
    const plan = planEnvoi(commandesEnAttente(b), "r1", () => "q1");
    expect(enveloppeSuivante(plan)).toEqual({ contractVersion: STUDIO_CONTRACT, requestId: "q1", baseRevisionId: "r1", commands: b.pas.flat() });
    // Le serveur, qui applique le même modèle, obtient exactement le document du brouillon.
    expect(applyStudioCommands(newStudioDocument("doc"), enveloppeSuivante(plan)!.commands)).toEqual(documentBrouillon(b));
  });
});

describe("A.5-06 / A.5-08 — report revalidé, changements d'autrui jamais effacés", () => {
  const base = applyStudioCommands(newStudioDocument("doc"), [ligne("a", 0), ligne("b", 4)]);

  it("éléments distincts : report sans chevauchement, les deux écritures sont conservées", () => {
    const tete = applyStudioCommands(base, [ligne("autrui", 10)]);
    const r = reporterSurTete(tete, [[deplacer("a", 1)]], base);
    expect(r.ok && r.chevauchements).toEqual([]);
    const doc = r.ok ? documentBrouillon(r.brouillon) : null;
    expect(doc?.objects.map((o) => o.id)).toEqual(["a", "b", "autrui"]);
  });

  it("même élément changé des deux côtés : le report nomme le chevauchement au lieu d'écraser", () => {
    const tete = applyStudioCommands(base, [deplacer("a", 5)]);
    const r = reporterSurTete(tete, [[deplacer("a", 1)], [deplacer("b", 1)]], base);
    expect(r.ok && r.chevauchements).toEqual(["objects:a"]);
    expect(identifiantsCites(r.ok ? r.chevauchements : [])).toBe("a");
    expect(identifiantsCites(Array.from({ length: 12 }, (_, i) => `objects:o${i}`))).toMatch(/^o0, .*o9, …$/);
  });

  it("annulation concurrente : annuler après un report ne retire jamais un changement d'autrui", () => {
    const tete = applyStudioCommands(base, [ligne("autrui", 10)]);
    const r = reporterSurTete(tete, [[ligne("moi", 20)]], base);
    if (!r.ok) throw new Error("report refusé");
    const annule = annulerBrouillon(r.brouillon);
    expect(documentBrouillon(annule).objects.map((o) => o.id)).toEqual(["a", "b", "autrui"]);
    // Plancher : le document de la nouvelle tête n'est pas annulable.
    expect(peutAnnuler(annule)).toBe(false);
    expect(documentBrouillon(annulerBrouillon(annule))).toEqual(tete);
  });

  it("des commandes qui ne s'appliquent plus sur la tête ne sont pas reportées", () => {
    const tete = applyStudioCommands(base, [{ toolId: "studio.dessin.supprimer", params: { ids: ["a"] } }]);
    expect(reporterSurTete(tete, [[deplacer("a", 1)]], base)).toEqual({ ok: false });
  });
});

describe("A.5-10 / A.5-11 — révision courante et invalidations dérivées", () => {
  it("une lecture n'est appliquée que si la même révision et le même brouillon sont toujours affichés", () => {
    const c1 = contexte("r1"), b1 = creerBrouillon(c1.revision.document);
    expect(lectureApplicable("r1", c1, b1, b1)).toBe(true);
    expect(lectureApplicable("r1", contexte("r2"), b1, b1)).toBe(false);
    expect(lectureApplicable("r1", c1, appliquerBrouillon(b1, [ligne("a", 0)]), b1)).toBe(false);
    expect(lectureApplicable("r1", null, b1, b1)).toBe(false);
  });
  it("aucune invalidation sans lot confirmé ; historique et étude relus après engagement", () => {
    expect(invalidationsApresEngagement(0, "p", "s", "v")).toEqual([]);
    expect(invalidationsApresEngagement(2, "p", "s", "v")).toEqual([["studio-revisions", "p", "s", "v"], ["studio-study", "p", "s"]]);
  });
  it("l'enregistrement ne relit les listes qu'à travers cette règle", () => {
    const enr = STUDIO.find((f) => f.chemin === "variante/useEnregistrement.ts")!.texte;
    expect(enr).not.toMatch(/queryKey: \["studio-study"/);
    expect([...enr.matchAll(/invalidationsApresEngagement\(/g)]).toHaveLength(2);
  });
});
