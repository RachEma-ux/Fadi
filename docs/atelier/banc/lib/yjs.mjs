// Yjs (MIT) pour le texte d'annotation (D-005 / R17) : mémoire, taille des mises à jour, granularité,
// convergence. Comparaison avec l'enveloppe JSON d'une commande typée équivalente (alternative « commandes »).
// Textes de départ : les 95 textes réels de P.118. Les sessions d'édition sont synthétiques et déterministes.
import * as Y from "yjs";
import { resume, arrondi } from "./stats.mjs";
import { versionPaquet } from "./paquets.mjs";

const gc = () => { globalThis.gc?.(); globalThis.gc?.(); };
const tas = () => { gc(); return process.memoryUsage().heapUsed; };

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function alea(graine) {
  let a = graine >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function enveloppeCommande(id, texte, revision) {
  // Forme indicative d'une commande `atelier-commands/1` (annexe B du cahier) ; seule sa taille est mesurée.
  return JSON.stringify({ requestId: "0b6f3c1e-7f0a-4d7e-9a51-2f4b8e6d1c90", type: "annotation.modifierTexte", baseRevision: revision, payload: { id, texte } });
}

function docAnnotations(textes, multiplicateur = 1) {
  const doc = new Y.Doc();
  const carte = doc.getMap("annotations");
  doc.transact(() => {
    for (let k = 0; k < multiplicateur; k++) for (const t of textes) {
      const yt = new Y.Text();
      yt.insert(0, t.texte);
      carte.set(multiplicateur === 1 ? t.id : `${t.id}#${k}`, yt);
    }
  });
  return doc;
}

export function mesurerYjs(scene) {
  const textes = scene.textes;
  const octetsTextes = textes.reduce((s, t) => s + Buffer.byteLength(t.texte), 0);

  // 1) État initial : 95 textes P.118, puis ×100 (9 500 annotations, textes P.118 répétés — synthétique).
  const charge = [];
  for (const mult of [1, 100]) {
    const avant = tas();
    const t0 = performance.now();
    const doc = docAnnotations(textes, mult);
    const creationMs = performance.now() - t0;
    const apres = tas();
    const etat = Y.encodeStateAsUpdate(doc);
    const t1 = performance.now();
    const doc2 = new Y.Doc();
    Y.applyUpdate(doc2, etat);
    const chargementMs = performance.now() - t1;
    charge.push({
      annotations: textes.length * mult, octetsTexteBrut: octetsTextes * mult, etatEncodeOctets: etat.length,
      tasDeltaKo: arrondi((apres - avant) / 1024, 1), creationMs: arrondi(creationMs), chargementEtatMs: arrondi(chargementMs),
    });
    doc.destroy(); doc2.destroy();
  }

  // 2) Granularité : taille d'une mise à jour Yjs selon l'édition, comparée à la commande JSON équivalente.
  const granularite = [];
  {
    const doc = docAnnotations(textes);
    const cible = textes.find((t) => t.texte.length >= 8) ?? textes[0];
    const yt = doc.getMap("annotations").get(cible.id);
    let derniere = null;
    doc.on("update", (u) => { derniere = u; });
    const essais = [
      ["insertion d'un caractère", () => yt.insert(yt.length, "x")],
      ["insertion d'un mot (6 car.)", () => yt.insert(0, "Salle ")],
      ["suppression d'un caractère", () => yt.delete(0, 1)],
      ["remplacement complet du texte", () => { yt.delete(0, yt.length); yt.insert(0, "Texte remplacé intégralement"); }],
    ];
    for (const [nom, f] of essais) {
      doc.transact(f);
      granularite.push({ edition: nom, majYjsOctets: derniere.length, commandeJsonOctets: Buffer.byteLength(enveloppeCommande(cible.id, yt.toString(), 1234)) });
    }
    doc.destroy();
  }

  // 3) Session concurrente : 2 clients, 5 000 éditions d'un caractère chacun sur le même texte,
  //    synchronisation toutes les 10 éditions ; convergence et croissance de l'état (tombstones).
  const session = (() => {
    const a = new Y.Doc(), b = new Y.Doc();
    a.clientID = 1; b.clientID = 2;
    Y.applyUpdate(a, Y.encodeStateAsUpdate(docAnnotations(textes)));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const id = textes[0].id;
    const ta = a.getMap("annotations").get(id), tb = b.getMap("annotations").get(id);
    const tailles = [];
    a.on("update", (u, origine) => { if (origine !== "sync") tailles.push(u.length); });
    b.on("update", (u, origine) => { if (origine !== "sync") tailles.push(u.length); });
    const r = alea(118);
    const avant = tas();
    const t0 = performance.now();
    const syncMs = [];
    for (let i = 0; i < 5000; i++) {
      for (const t of [ta, tb]) {
        if (t.length > 3 && r() < 0.3) t.delete(Math.floor(r() * t.length), 1);
        else t.insert(Math.floor(r() * (t.length + 1)), String.fromCharCode(97 + Math.floor(r() * 26)));
      }
      if (i % 10 === 9) {
        const s0 = performance.now();
        Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), "sync");
        Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), "sync");
        syncMs.push(performance.now() - s0);
      }
    }
    const dureeMs = performance.now() - t0;
    const apres = tas();
    const etat = Y.encodeStateAsUpdate(a);
    const res = {
      editions: 10000, dureeMs: arrondi(dureeMs), convergence: ta.toString() === tb.toString(),
      longueurTexteFinal: ta.length, etatEncodeOctets: etat.length, majParEditionOctets: resume(tailles, 0), synchronisationMs: resume(syncMs, 3),
      tasDeltaDeuxClientsKo: arrondi((apres - avant) / 1024, 1),
    };
    a.destroy(); b.destroy();
    return res;
  })();

  return { version: versionPaquet("yjs"), texteSource: { annotations: textes.length, octets: octetsTextes }, charge, granularite, session };
}
