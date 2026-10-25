/**
 * Temps réel — protocole (RTC-1) : lecture bornée et typée des messages, débit, journal de reprise, projection par
 * destinataire. Pur, sans base.
 */
import { describe, expect, it } from "vitest";
import { BORNES_TEMPS_REEL, JournalReprise, LimiteurDebit, lireMessage } from "./temps-reel-protocole.js";
import { droitFrais, evenementVisible, objetsAutorises, projeter } from "./temps-reel-projection.js";

const camera = { projection: "perspective", position: { x: 10, y: -8, z: 6 }, target: { x: 0, y: 0, z: 0 }, fov: 50 };

describe("Temps réel — lecture des messages", () => {
  it("accepte les messages du contrat, refuse tout le reste sans exception", () => {
    expect(lireMessage(JSON.stringify({ v: 1, type: "rejoindre", sessionId: "rtses_1" }))).toMatchObject({ ok: true });
    expect(lireMessage(JSON.stringify({ v: 1, type: "vue", affichage: "3d", camera }))).toMatchObject({ ok: true });
    expect(lireMessage(JSON.stringify({ v: 1, type: "vue", affichage: "2d", plan: { x: 0, y: 0, w: 20, h: 10 } }))).toMatchObject({ ok: true });
    expect(lireMessage("pas du json")).toEqual({ ok: false, motif: "json" });
    expect(lireMessage(JSON.stringify({ v: 2, type: "ping" }))).toEqual({ ok: false, motif: "schema" });
    // Champ supplémentaire (métadonnée forgée) : refusé, jamais relayé.
    expect(lireMessage(JSON.stringify({ v: 1, type: "pointeur", espace: "plan", x: 1, y: 2, titre: "secret" }))).toEqual({ ok: false, motif: "schema" });
    expect(lireMessage(JSON.stringify({ v: 1, type: "selection", objectIds: ["<script>"] }))).toEqual({ ok: false, motif: "schema" });
  });

  it("caméra relue par le contrat des scènes Studio (repère local-3d)", () => {
    expect(lireMessage(JSON.stringify({ v: 1, type: "vue", affichage: "3d", camera: { ...camera, fov: 0 } }))).toEqual({ ok: false, motif: "schema" });
    expect(lireMessage(JSON.stringify({ v: 1, type: "vue", affichage: "3d", camera: { ...camera, target: camera.position } }))).toEqual({ ok: false, motif: "schema" });
    expect(lireMessage(JSON.stringify({ v: 1, type: "pointeur", espace: "3d", x: 2e9, y: 0 }))).toEqual({ ok: false, motif: "schema" });
  });

  it("message de plus de 16 Kio : refusé avant toute lecture", () => {
    const gros = JSON.stringify({ v: 1, type: "selection", objectIds: Array.from({ length: 2000 }, (_, i) => `objet-${i}`) });
    expect(Buffer.byteLength(gros)).toBeGreaterThan(BORNES_TEMPS_REEL.octetsParMessage);
    expect(lireMessage(gros)).toEqual({ ok: false, motif: "trop-gros" });
  });
});

describe("Temps réel — bornes", () => {
  it("débit : 10 éphémères par seconde, au-delà abandonnés, puis la fenêtre glisse", () => {
    const l = new LimiteurDebit();
    const acceptes = Array.from({ length: 50 }, (_, i) => l.accepter(1000 + i)).filter(Boolean).length;
    expect(acceptes).toBe(10);
    expect(l.accepter(2001)).toBe(true);
  });

  it("journal de reprise : événements postérieurs, resynchronisation au-delà de la fenêtre", () => {
    const j = new JournalReprise();
    for (let i = 0; i < 3; i++) j.ajouter({ nature: "presentateur", presentateurId: "a", par: "a" }, 1000 + i);
    expect(j.depuis(1, 1010)?.map((e) => e.seq)).toEqual([2, 3]);
    expect(j.depuis(3, 1010)).toEqual([]);
    expect(j.depuis(9, 1010)).toBeNull();
    // Plus de 5 minutes : purgé, le client se resynchronise.
    expect(j.depuis(0, 1000 + BORNES_TEMPS_REEL.rejeuMs + 10)).toBeNull();
  });
});

describe("Temps réel — projection par destinataire (RT-R7)", () => {
  const objets = new Set(["mur-1", "baie-2"]);
  const lecteur = { userId: "l", role: "lecteur" as const, droitRelu: 1000 };
  const editeur = { userId: "e", role: "editeur" as const, droitRelu: 1000 };

  it("une sélection ne cite que des objets du document épinglé (identifiant forgé retiré)", () => {
    expect(objetsAutorises(["mur-1", "inconnu", "mur-1", "baie-2"], objets)).toEqual(["mur-1", "baie-2"]);
    const p = projeter({ v: 1, type: "selection", de: "e", objectIds: ["secret-hors-document", "mur-1"] }, lecteur, 1500, objets);
    expect(p).toEqual({ v: 1, type: "selection", de: "e", objectIds: ["mur-1"] });
  });

  it("droit non relu depuis plus de 3 s : rien n'est diffusé", () => {
    expect(droitFrais(lecteur, 1000 + BORNES_TEMPS_REEL.fraicheurDroitMs)).toBe(true);
    expect(droitFrais(lecteur, 1001 + BORNES_TEMPS_REEL.fraicheurDroitMs)).toBe(false);
    expect(droitFrais({ ...lecteur, droitRelu: 0 }, 1000)).toBe(false);
    expect(projeter({ v: 1, type: "pointeur", de: "e", espace: "plan", x: 0, y: 0 }, lecteur, 99_999, objets)).toBeNull();
  });

  it("annotation réservée à l'équipe : annoncée au propriétaire et aux éditeurs seulement", () => {
    const e = { nature: "annotation" as const, commentId: "c1", audience: "equipe" as const, revisionId: "r1", auteurId: "e" };
    expect(evenementVisible(e, lecteur)).toBe(false);
    expect(evenementVisible(e, editeur)).toBe(true);
    expect(evenementVisible({ ...e, audience: "projet" }, lecteur)).toBe(true);
  });

  it("ses propres éphémères ne reviennent jamais à leur auteur", () => {
    expect(projeter({ v: 1, type: "pointeur", de: "l", espace: "plan", x: 0, y: 0 }, lecteur, 1500, objets)).toBeNull();
  });
});
