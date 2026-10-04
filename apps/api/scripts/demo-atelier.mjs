#!/usr/bin/env node
/**
 * Démonstration en ligne de commande du service de commandes du nouvel Atelier (lot 2, L2.5) :
 * idempotence (T06), conflit entre deux comptes (T08) et rejeu d'une file après coupure, contre une API locale déjà démarrée.
 *
 *   npm run dev:api                                  # ou : node apps/api/dist/server.js
 *   node apps/api/scripts/demo-atelier.mjs           # API_URL=http://localhost:3001 par défaut
 *
 * Crée deux comptes jetables (Alice propriétaire, Bruno éditeur) et un projet, puis :
 * 1. envoie deux fois la même enveloppe (même requestId) → même réponse, une seule révision ;
 * 2. Alice et Bruno partent de la même révision ; Bruno arrive second → 409 détaillé ;
 * 3. Bruno recharge et rejoue avec un nouveau requestId → accepté ;
 * 4. coupure et rejeu : A acceptée mais réponse perdue, B et C en file hors ligne (bases chaînées), rejeu dans
 *    l'ordre → A rend la réponse enregistrée, B et C s'appliquent.
 * Code de sortie 0 si tout est conforme, 1 sinon.
 */
const API = (process.env.API_URL ?? "http://localhost:3001").replace(/\/$/, "");
const suffixe = `${Date.now()}`;
let echecs = 0;

function verifier(condition, libelle) {
  console.log(`${condition ? "✓" : "✗"} ${libelle}`);
  if (!condition) echecs++;
}

/** Client minimal à cookie de session. */
async function compte(email) {
  let cookie = "";
  const appel = async (methode, chemin, corps) => {
    const r = await fetch(`${API}${chemin}`, {
      method: methode,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });
    const sc = r.headers.get("set-cookie");
    if (sc) cookie = sc.split(";")[0];
    const texte = await r.text();
    let body = null;
    try {
      body = texte ? JSON.parse(texte) : null;
    } catch {
      throw new Error(`${methode} ${chemin} : HTTP ${r.status}, réponse non JSON : ${texte.slice(0, 200)}`);
    }
    return { status: r.status, body };
  };
  const r = await appel("POST", "/auth/register", { email, password: "correct-horse-battery" });
  if (r.status !== 201) throw new Error(`inscription de ${email} : ${r.status} ${JSON.stringify(r.body)}`);
  return appel;
}

const P = (x, y) => ({ x, y, frame: "local", unit: "m" });
const m = (value) => ({ value, unit: "m" });
const mur = (id, x) => ({
  type: "mur.tracer",
  params: { id, niveauId: "rdc", calqueId: "C1", a: P(x, 0), b: P(x, 6), epaisseur: m(0.2), hauteur: m(3), alignement: "axe", typeId: "non-type", exterieur: true },
  cibles: [],
});
const enveloppe = (requestId, baseRevision, label, commands) => ({ requestId, baseRevision, contract: "atelier-commands/1", label, commands });

const alice = await compte(`alice-${suffixe}@demo.fadi`);
const bruno = await compte(`bruno-${suffixe}@demo.fadi`);
const projet = (await alice("POST", "/projects", { code: "DEMO", name: "Démonstration lot 2" })).body.id;
await alice("POST", `/projects/${projet}/members`, { email: `bruno-${suffixe}@demo.fadi`, role: "editeur" });
const A = `/projects/${projet}/atelier`;
console.log(`API ${API} · projet ${projet}`);

const m0 = (await alice("GET", `${A}/model`)).body;
console.log(`Modèle initial : révision ${m0.revision}, empreinte ${m0.empreinte.slice(0, 19)}…`);
const prep = await alice("POST", `${A}/commands`, enveloppe(`prep-${suffixe}`, m0.revision, "Préparer", [
  { type: "niveau.creer", params: { id: "rdc", nom: "Rez", elevation: m(0), hauteur: m(3), ordre: 0 }, cibles: [] },
  { type: "calque.creer", params: { id: "C1", nom: "Murs", couleur: "#336699", visible: true, verrouille: false, ordre: 0 }, cibles: [] },
]));
const r0 = prep.body.revision;
console.log(`Niveau et calque créés : révision ${r0}`);

console.log("\n— Idempotence (T06) —");
const env = enveloppe(`mur-${suffixe}`, r0, "Tracer un mur", [mur("M1", 0)]);
const e1 = await alice("POST", `${A}/commands`, env);
const e2 = await alice("POST", `${A}/commands`, env);
console.log(`1er envoi : HTTP ${e1.status} révision ${e1.body.revision} journal ${e1.body.journalId}`);
console.log(`2e envoi  : HTTP ${e2.status} révision ${e2.body.revision} journal ${e2.body.journalId}`);
verifier(e1.status === 200 && e2.status === 200, "les deux envois sont acceptés (200)");
verifier(JSON.stringify(e1.body) === JSON.stringify(e2.body), "réponse identique (réponse enregistrée, rien de réappliqué)");
const journal = (await alice("GET", `${A}/journal?apres=${r0}`)).body;
verifier(journal.revisionCourante === r0 + 1 && journal.entrees.length === 1, `une seule révision (${journal.revisionCourante}) et une seule entrée au journal`);

console.log("\n— Conflit entre deux comptes (T08) —");
const base = r0 + 1;
const ra = await alice("POST", `${A}/commands`, enveloppe(`a-${suffixe}`, base, "Mur d'Alice", [mur("MA", 3)]));
console.log(`Alice (base ${base}) : HTTP ${ra.status} → révision ${ra.body.revision}`);
const rb = await bruno("POST", `${A}/commands`, enveloppe(`b-${suffixe}`, base, "Mur de Bruno", [mur("MB", 5)]));
console.log(`Bruno (base ${base}) : HTTP ${rb.status}`);
console.log(JSON.stringify({ ...rb.body, conflits: rb.body.conflits?.map((c) => ({ objetId: c.objetId, motif: c.motif, etatServeur: c.etatServeur ? `${c.etatServeur.classe} ${c.etatServeur.id}` : null })) }, null, 2));
verifier(rb.status === 409 && rb.body.erreur === "conflit", "Bruno reçoit 409 « conflit »");
verifier(rb.body.revisionCourante === base + 1 && rb.body.conflits?.some((c) => c.objetId === "MA"), "le conflit cite le mur d'Alice tel qu'il est sur le serveur");
const rejeu = await bruno("POST", `${A}/commands`, enveloppe(`b2-${suffixe}`, rb.body.revisionCourante, "Mur de Bruno", [mur("MB", 5)]));
console.log(`Bruno rejoue sur la révision ${rb.body.revisionCourante} (nouveau requestId) : HTTP ${rejeu.status} → révision ${rejeu.body.revision}`);
verifier(rejeu.status === 200, "le rejeu sur la révision courante est accepté");

console.log("\n— Coupure et rejeu (file hors ligne) —");
const rc = rejeu.body.revision;
const envA = enveloppe(`hl-a-${suffixe}`, rc, "Mur A (réponse perdue)", [mur("HA", 7)]);
await alice("POST", `${A}/commands`, envA); // le serveur l'applique ; la réponse est « perdue » : on l'ignore
console.log(`A envoyée sur la révision ${rc}, réponse perdue (coupure) : A reste en file`);
// Hors ligne : B et C en file, bases chaînées localement (A optimiste comprise), exactement comme le bus.
const file = [envA, enveloppe(`hl-b-${suffixe}`, rc + 1, "Mur B (hors ligne)", [mur("HB", 9)]), enveloppe(`hl-c-${suffixe}`, rc + 2, "Mur C (hors ligne)", [mur("HC", 11)])];
console.log(`File hors ligne : ${file.map((e) => `${e.label.split(" (")[0]} base ${e.baseRevision}`).join(", ")}`);
const rejoues = [];
for (const e of file) {
  const r = await alice("POST", `${A}/commands`, e);
  rejoues.push(r);
  console.log(`Rejeu ${e.label.split(" (")[0]} : HTTP ${r.status} → révision ${r.body.revision} journal ${r.body.journalId}`);
}
verifier(rejoues.every((r) => r.status === 200), "les trois rejeux sont acceptés (200)");
verifier(rejoues[0].body.revision === rc + 1, "A rend la réponse enregistrée (aucune nouvelle révision)");
const jh = (await alice("GET", `${A}/journal?apres=${rc}`)).body;
verifier(jh.revisionCourante === rc + 3 && jh.entrees.length === 3 && jh.entrees.filter((e) => e.requestId === envA.requestId).length === 1, `révision finale ${jh.revisionCourante}, trois entrées au journal (A une seule fois)`);

console.log(echecs === 0 ? "\nDémonstration conforme." : `\n${echecs} contrôle(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
