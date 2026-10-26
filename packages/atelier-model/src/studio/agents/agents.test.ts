import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { generateKeyPairSync, sign, verify } from "node:crypto";
import { STUDIO_COMMAND_TOOL_IDS } from "../registry.js";
import { STUDIO_CAPACITES_AVANCEES, studioCapaciteIncomplete } from "./capacites.js";
import { STUDIO_EXTENSION_MCP, studioEvaluerExtension, studioMessageSigneExtension, type StudioDeclarationExtension } from "./extensions.js";
import { STUDIO_FOURNISSEUR_LOCAL, studioIllustrationLocale, studioValiderParametresIllustration, type StudioImageRgba } from "./illustration-locale.js";
import { STUDIO_OUTILS_MCP, studioTraiterMessageMcp, type StudioGestionnairesMcp } from "./mcp.js";
import { STUDIO_POLITIQUE_TRANSFERT_DEFAUT, studioControlerTransfert, type StudioDemandeTransfert, type StudioPolitiqueTransfert } from "./politique-transfert.js";
import { studioLireProvenanceRendu, studioPromesseReproduction, studioProvenanceIllustration, type EntreeProvenanceIllustration } from "./provenance-illustration.js";
import { studioProvenanceRendu } from "../scenes/provenance.js";

const SHA_A = "a".repeat(64), SHA_B = "b".repeat(64), SHA_C = "c".repeat(64);

// ——— TR-EX-094 : contrôle de politique avant transfert ———
const politiqueOuverte: StudioPolitiqueTransfert = { transfertsExternes: "avec-consentement", classificationsAdmises: ["publique", "interne"], contrat: null, fournisseursAutorises: ["externe"] };
const demande = (): StudioDemandeTransfert => ({
  fournisseur: { id: "externe", nature: "externe", active: true, cleFournie: true, cout: { montant: 0.04, devise: "CHF" }, version: null, droits: null, quotas: null },
  sources: [{ type: "rendu", empreinte: SHA_A, classification: "interne", provenanceConnue: true }],
  consentement: { transfertExterne: true, coutAccepte: { montant: 0.04, devise: "CHF" } },
  droitExport: true,
});

describe("TR-EX-094 — transfert externe seulement au terme d'un contrôle de politique", () => {
  it("TR-EX-094 [+] politique, fournisseur, source connue, droit d'export et consentement au coût déclaré : transfert autorisé, inconnues signalées", () => {
    const v = studioControlerTransfert(politiqueOuverte, demande());
    expect(v).toEqual({ autorise: true, transfert: "externe", inconnues: ["version du fournisseur inconnue", "restrictions de droits non déclarées par le fournisseur", "quotas non évalués"] });
    // Un fournisseur local ne transfère rien, même sous la politique par défaut.
    expect(studioControlerTransfert(STUDIO_POLITIQUE_TRANSFERT_DEFAUT, { ...demande(), fournisseur: { ...demande().fournisseur, nature: "local" } })).toEqual({ autorise: true, transfert: "aucun", inconnues: [] });
  });
  it("TR-EX-094 [−] chaque manque bloque avant transmission : politique par défaut, source confidentielle sans contrat, classification ou provenance inconnue, consentement ou coût absents", () => {
    const codes = (p: StudioPolitiqueTransfert, d: StudioDemandeTransfert) => { const v = studioControlerTransfert(p, d); return v.autorise ? [] : v.refus.map((r) => r.code); };
    expect(codes(STUDIO_POLITIQUE_TRANSFERT_DEFAUT, demande())).toEqual(expect.arrayContaining(["politique-interdit", "fournisseur-non-autorise", "classification-refusee"]));
    const d = demande();
    const cas: [Partial<StudioDemandeTransfert>, string][] = [
      [{ fournisseur: { ...d.fournisseur, active: false } }, "fournisseur-inactif"],
      [{ fournisseur: { ...d.fournisseur, cleFournie: false } }, "cle-absente"],
      [{ fournisseur: { ...d.fournisseur, cout: null } }, "cout-non-declare"],
      [{ sources: [] }, "aucune-source"],
      [{ sources: [{ ...d.sources[0]!, provenanceConnue: false }] }, "provenance-inconnue"],
      [{ sources: [{ ...d.sources[0]!, classification: "inconnue" }] }, "classification-inconnue"],
      [{ consentement: null }, "consentement-absent"],
      [{ consentement: { transfertExterne: true, coutAccepte: { montant: 0.01, devise: "CHF" } } }, "cout-non-accepte"],
      [{ consentement: { transfertExterne: true, coutAccepte: { montant: 0.04, devise: "EUR" } } }, "cout-non-accepte"],
      [{ droitExport: false }, "droit-export-absent"],
    ];
    for (const [modif, code] of cas) expect(codes(politiqueOuverte, { ...d, ...modif }), code).toEqual([code]);
    // Source confidentielle : admise par la politique mais sans contrat cité → bloquée ; avec contrat → autorisée.
    const conf = { ...d, sources: [{ ...d.sources[0]!, classification: "confidentielle" as const }] };
    expect(codes({ ...politiqueOuverte, classificationsAdmises: ["confidentielle"] }, conf)).toEqual(["contrat-absent"]);
    expect(codes({ ...politiqueOuverte, classificationsAdmises: ["confidentielle"], contrat: "DPA-2026-01" }, conf)).toEqual([]);
  });
});

// ——— Fournisseur local déterministe ———
function image(w: number, h: number): StudioImageRgba {
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { rgba[i * 4] = (i * 37) % 256; rgba[i * 4 + 1] = (i * 11) % 256; rgba[i * 4 + 2] = i % 2 ? 255 : 0; rgba[i * 4 + 3] = 255; }
  return { largeur: w, hauteur: h, rgba };
}

describe("F.2-03 — illustration locale : honnêtement nommée, déterministe, source intacte", () => {
  it("F.2-03 [+] le fournisseur local n'est pas une IA : nom « sans IA », aucun réseau ; même entrée → mêmes pixels, la source n'est pas touchée", () => {
    expect(STUDIO_FOURNISSEUR_LOCAL).toMatchObject({ id: "local-derive", nature: "local-deterministe", reseau: false });
    expect(STUDIO_FOURNISSEUR_LOCAL.nom).toContain("sans IA");
    const src = image(9, 7);
    const copie = src.rgba.slice();
    for (const style of ["trait", "lavis", "sepia"] as const) {
      const p = { style, intensite: 0.6 };
      const a = studioIllustrationLocale(src, p), b = studioIllustrationLocale(src, p);
      expect(a.rgba).toEqual(b.rgba);
      expect(a.rgba).not.toEqual(src.rgba);
      expect([a.largeur, a.hauteur]).toEqual([9, 7]);
    }
    expect(src.rgba).toEqual(copie);
    expect(studioIllustrationLocale(src, { style: "trait", intensite: 0.6 }).rgba).not.toEqual(studioIllustrationLocale(src, { style: "lavis", intensite: 0.6 }).rgba);
  });
  it("F.2-03 [−] paramètres hors contrat ou image incohérente : refusés", () => {
    for (const p of [{ style: "photo", intensite: 0.5 }, { style: "trait", intensite: 2 }, { style: "trait", intensite: 0.333 }, { style: "trait" }, { style: "trait", intensite: 0.5, graine: 1 }]) {
      expect(() => studioValiderParametresIllustration(p)).toThrow();
    }
    expect(() => studioIllustrationLocale({ largeur: 2, hauteur: 2, rgba: new Uint8Array(3) }, { style: "trait", intensite: 0.5 })).toThrow();
    expect(() => studioIllustrationLocale({ largeur: 5000, hauteur: 1, rgba: new Uint8Array(20000) }, { style: "trait", intensite: 0.5 })).toThrow();
  });
});

// ——— Provenance, vérification, reproductibilité ———
const rendu = studioProvenanceRendu({ etude: { id: "s", nom: "Étude" }, variante: { id: "v", nom: "Variante" }, revisionId: "r1", scene: null, date: new Date("2026-10-25T10:00:00Z"), camera: { projection: "perspective", position: { x: 10, y: -10, z: 8 }, target: { x: 0, y: 0, z: 0 }, fov: 50 } , auteur: { id: "proprietaire", email: null } });
const entreeLocale = (): EntreeProvenanceIllustration => ({
  rendu, empreinteImageSource: SHA_A, modele: { revisionId: "r1", empreinteAvant: SHA_B, empreinteApres: SHA_B }, parametres: { style: "trait", intensite: 0.5 },
  auteurId: "editeur", date: new Date("2026-10-25T10:01:00Z"),
  fournisseur: { id: STUDIO_FOURNISSEUR_LOCAL.id, nom: STUDIO_FOURNISSEUR_LOCAL.nom, nature: "local-deterministe", version: STUDIO_FOURNISSEUR_LOCAL.version, service: null, reseau: false },
  sourcesEnvoyees: [], droits: null, autorisation: { transfert: "aucun", politique: "aucun transfert", consentement: null }, cout: null, quotas: null, inconnues: [],
  resultat: { empreinte: SHA_C, largeur: 9, hauteur: 7 },
});
const entreeExterne = (): EntreeProvenanceIllustration => ({
  ...entreeLocale(),
  fournisseur: { id: "externe", nom: "Service d’essai", nature: "ia-externe", version: null, service: "illustrations.exemple.test", reseau: true },
  sourcesEnvoyees: [{ type: "rendu", empreinte: SHA_A, classification: "interne", provenanceConnue: true }],
  autorisation: { transfert: "externe", politique: "avec-consentement", consentement: { par: "editeur", le: new Date("2026-10-25T10:00:30Z"), coutAccepte: { montant: 0.04, devise: "CHF" } } },
  cout: { montant: 0.04, devise: "CHF" }, inconnues: ["version du fournisseur inconnue"],
});

describe("TR-EX-071 / TR-EX-072 / TR-AC-007 — provenance, statut de vérification et reproductibilité honnête", () => {
  it("TR-EX-071 [+] la provenance porte révision, caméra, paramètres, auteur, date, empreintes ; l'IA externe y ajoute fournisseur, version « inconnue », sources envoyées, consentement, coûts et quotas", () => {
    const p = studioProvenanceIllustration(entreeLocale());
    expect(p).toMatchObject({ nature: "illustration", mode: "derivee-locale", source: { rendu: { revisionId: "r1", camera: rendu.camera }, empreinteImage: SHA_A }, parametres: { style: "trait", intensite: 0.5 }, auteur: { id: "editeur" }, date: "2026-10-25T10:01:00.000Z", sourcesEnvoyees: [], couts: { montant: 0 }, resultat: { empreinte: SHA_C } });
    const e = studioProvenanceIllustration(entreeExterne());
    expect(e).toMatchObject({ mode: "ia-externe", fournisseur: { version: "inconnue", service: "illustrations.exemple.test" }, sourcesEnvoyees: [{ type: "rendu", empreinte: SHA_A }], droits: "non déclarés par le fournisseur", autorisation: { transfert: "externe", consentement: { par: "editeur", coutAccepte: { montant: 0.04, devise: "CHF" } } }, couts: { montant: 0.04, devise: "CHF" }, quotas: "non évalués" });
  });
  it("TR-EX-071 [−] appel externe sans autorisation de transfert ou sans coût : refusé, jamais une provenance complétée", () => {
    expect(() => studioProvenanceIllustration({ ...entreeExterne(), autorisation: { transfert: "externe", politique: "x", consentement: null } })).toThrow(/autorisation/);
    expect(() => studioProvenanceIllustration({ ...entreeExterne(), cout: null })).toThrow(/coût/);
    expect(() => studioProvenanceIllustration({ ...entreeLocale(), sourcesEnvoyees: entreeExterne().sourcesEnvoyees })).toThrow(/local/);
    expect(() => studioLireProvenanceRendu({ ...rendu, nature: "illustration" })).toThrow();
    expect(() => studioLireProvenanceRendu({ ...rendu, revisionId: "" })).toThrow();
    expect(studioLireProvenanceRendu(JSON.parse(JSON.stringify(rendu)))).toEqual(rendu);
  });
  it("TR-AC-007 [+] / [−] l'illustration atteste le modèle inchangé et se déclare « non vérifiée » ; un modèle modifié ou une autre révision refusent l'illustration", () => {
    const p = studioProvenanceIllustration(entreeLocale());
    expect(p.modele).toEqual({ revisionId: "r1", empreinteAvant: SHA_B, empreinteApres: SHA_B, inchange: true });
    expect(p.verification.statut).toBe("non-verifiee");
    expect(p.verification.portee).toMatch(/ni métrique, ni conforme/);
    expect(() => studioProvenanceIllustration({ ...entreeLocale(), modele: { revisionId: "r1", empreinteAvant: SHA_B, empreinteApres: SHA_C } })).toThrow(/modèle source a changé/);
    expect(() => studioProvenanceIllustration({ ...entreeLocale(), modele: { revisionId: "r2", empreinteAvant: SHA_B, empreinteApres: SHA_B } })).toThrow(/révision/);
  });
  it("TR-EX-072 [+] / [−] paramètres archivés ; seule l'illustration locale promet les mêmes pixels, l'IA externe déclare ses inconnues et ne promet ni identité ni fidélité géométrique", () => {
    const l = studioProvenanceIllustration(entreeLocale()), e = studioProvenanceIllustration(entreeExterne());
    expect(studioPromesseReproduction(l)).toBe("identique");
    expect(l.reproductibilite.garantie).toMatch(/Aucune fidélité géométrique/);
    expect(studioPromesseReproduction(e)).toBe("non-garantie");
    expect(e.reproductibilite).toMatchObject({ deterministe: false });
    expect(e.reproductibilite.garantie).toMatch(/pas garantie identique, ni au pixel ni en géométrie/);
    expect(e.reproductibilite.inconnues).toEqual(expect.arrayContaining(["version du fournisseur inconnue", "graine et traitements internes du fournisseur"]));
    expect(e.parametres).toEqual({ style: "trait", intensite: 0.5 });
  });
});

// ——— TR-EX-031 / F.3-01 : déclaration d'extension ———
describe("TR-EX-031 — déclaration d'extension : provenance, confiance, permissions, mises à jour ; trouvée ≠ autorisée", () => {
  const cles = generateKeyPairSync("ed25519");
  const verifier = (cleId: string, message: string, signature: string) => cleId === "cle-admin" && verify(null, Buffer.from(message), cles.publicKey, Buffer.from(signature, "base64"));
  const signee = (): StudioDeclarationExtension => {
    const d: StudioDeclarationExtension = {
      schema: "studio-extension/1", id: "exemple.metrage", nom: "Métrage d’essai", version: "1.2.0",
      provenance: { editeur: "Éditeur d’essai", source: "https://extensions.exemple.test/metrage", empreinte: SHA_A },
      confiance: { mecanisme: "signature-ed25519", cleId: "cle-admin", signature: "" },
      permissions: ["lire-variante", "proposer-commandes"], dependances: [{ id: "fadi.studio.mcp", version: "1.0.0" }],
      misesAJour: { politique: "manuelle", canal: "https://extensions.exemple.test/metrage/versions" }, support: { contact: "support@exemple.test" },
    };
    (d.confiance as { signature: string }).signature = sign(null, Buffer.from(studioMessageSigneExtension(d)), cles.privateKey).toString("base64");
    return d;
  };
  it("TR-EX-031 [+] extension signée par une clé de confiance : vérifiée, puis autorisée seulement pour cette version ; l'adaptateur MCP intégré est déclaré", () => {
    expect(studioEvaluerExtension(signee(), { verifier, autorisees: new Set() })).toMatchObject({ etat: "verifiee", chargement: "aucun", permissions: ["lire-variante", "proposer-commandes"] });
    expect(studioEvaluerExtension(signee(), { verifier, autorisees: new Set(["exemple.metrage@1.2.0"]) })).toMatchObject({ etat: "autorisee", motifs: [] });
    expect(studioEvaluerExtension({ ...signee(), version: "1.3.0" }, { verifier, autorisees: new Set(["exemple.metrage@1.2.0"]) }).etat).toBe("decouverte");
    expect(STUDIO_EXTENSION_MCP).toMatchObject({ provenance: { source: "fadi:integre" }, confiance: { mecanisme: "integre" }, misesAJour: { politique: "avec-fadi" } });
    expect(studioEvaluerExtension(STUDIO_EXTENSION_MCP, { verifier, autorisees: new Set(["fadi.studio.mcp@1.0.0"]) }).etat).toBe("autorisee");
  });
  it("TR-EX-031 [−] trouvée dans le registre sans signature valide : découverte, non autorisée ; script arbitraire : refusée, rien chargé ; « intégré » usurpé : découverte", () => {
    const alteree = { ...signee(), permissions: ["lire-variante", "proposer-commandes", "lire-etudes"] };
    expect(studioEvaluerExtension(alteree, { verifier, autorisees: new Set(["exemple.metrage@1.2.0"]) })).toMatchObject({ etat: "decouverte", chargement: "aucun" });
    const script = { ...signee(), script: "https://extensions.exemple.test/code.js" };
    expect(studioEvaluerExtension(script, { verifier, autorisees: new Set(["exemple.metrage@1.2.0"]) })).toMatchObject({ etat: "refusee", chargement: "aucun", permissions: [] });
    const usurpee = { ...signee(), confiance: { mecanisme: "integre" } };
    expect(studioEvaluerExtension(usurpee, { verifier, autorisees: new Set(["exemple.metrage@1.2.0"]) }).etat).toBe("decouverte");
    expect(studioEvaluerExtension({ ...signee(), permissions: ["tout"] }, { verifier, autorisees: new Set() }).etat).toBe("refusee");
  });
});

// ——— TEST-033 / F.3-02 / F.3-03 : adaptateur MCP (partie pure) ———
describe("TEST-033 — adaptateur MCP : même contrat de commandes, confirmation, aucun outil de pointeur", () => {
  const appels: string[] = [];
  const g = (permissions: string[]): StudioGestionnairesMcp => ({ permissions: new Set(permissions) as never, appelerOutil: async (nom) => { appels.push(nom); return { contenu: { ok: nom }, erreur: false }; } });
  const tous = STUDIO_EXTENSION_MCP.permissions;
  it("F.3-02 [+] initialize, tools/list et tools/call : une seule écriture, la proposition, sur les identifiants du registre, à confirmer", async () => {
    const init = await studioTraiterMessageMcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "essai", version: "1" } } }, g(tous));
    expect(init).toMatchObject({ id: 1, result: { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "fadi-studio" } } });
    const liste = await studioTraiterMessageMcp({ jsonrpc: "2.0", id: 2, method: "tools/list" }, g(tous)) as { result: { tools: { name: string; annotations: { readOnlyHint: boolean } }[] } };
    expect(liste.result.tools.map((t) => t.name)).toEqual(["studio_lister_etudes", "studio_lire_variante", "studio_outils", "studio_proposer_commandes", "studio_etat_proposition"]);
    expect(liste.result.tools.filter((t) => !t.annotations.readOnlyHint).map((t) => t.name)).toEqual(["studio_proposer_commandes"]);
    expect(STUDIO_OUTILS_MCP.filter((o) => o.confirmation).map((o) => o.name)).toEqual(["studio_proposer_commandes"]);
    const schema = STUDIO_OUTILS_MCP.find((o) => o.name === "studio_proposer_commandes")!.inputSchema as { properties: { commands: { items: { properties: { toolId: { enum: string[] } } } } } };
    expect(schema.properties.commands.items.properties.toolId.enum).toEqual([...STUDIO_COMMAND_TOOL_IDS]);
    const r = await studioTraiterMessageMcp({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "studio_lire_variante", arguments: { studyId: "s", variantId: "v" } } }, g(tous));
    expect(r).toMatchObject({ id: 3, result: { isError: false, structuredContent: { ok: "studio_lire_variante" } } });
    expect(await studioTraiterMessageMcp({ jsonrpc: "2.0", method: "notifications/initialized" }, g(tous))).toBeNull();
  });
  it("F.3-02 [−] outil inconnu, permission non accordée, arguments hors schéma, méthode inconnue : refus JSON-RPC, aucun gestionnaire appelé", async () => {
    appels.length = 0;
    const err = async (m: unknown, p = tous as readonly string[]) => ((await studioTraiterMessageMcp(m, g([...p]))) as { error?: { code: number } }).error?.code;
    expect(await err({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "studio_ecrire_revision", arguments: {} } })).toBe(-32602);
    expect(await err({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "studio_proposer_commandes", arguments: { studyId: "s", variantId: "v", requestId: "q", baseRevisionId: "r", commands: [] } } }, ["lire-variante"])).toBe(-32602);
    expect(await err({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "studio_lire_variante", arguments: { studyId: "s", variantId: "v", authorId: "proprietaire" } } })).toBe(-32602);
    expect(await err({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "studio_lire_variante", arguments: { studyId: "s/../x", variantId: "v" } } })).toBe(-32602);
    expect(await err({ jsonrpc: "2.0", id: 5, method: "resources/subscribe" })).toBe(-32601);
    expect(await err({ jsonrpc: "1.0", id: 6, method: "ping" })).toBe(-32600);
    expect(appels).toEqual([]);
  });
  it("F.3-03 [−] aucun outil ne suit le pointeur, ne prévisualise au survol ni ne diffuse en continu : chaque appel est un acte explicite", () => {
    for (const o of STUDIO_OUTILS_MCP) expect(`${o.name} ${o.title} ${o.description}`).not.toMatch(/pointeur|pointer|survol|hover|curseur|cursor|stream|continu/i);
    expect(STUDIO_OUTILS_MCP.every((o) => o.annotations.openWorldHint === false)).toBe(true);
  });
});

// ——— F.2-01 / F.2-04 : capacités déclarées ———
describe("F.2-01 / F.2-04 — chaque capacité engagée a contrat, droits, coûts, confidentialité, provenance et corpus", () => {
  it("F.2-01 [+] déclarations complètes ; F.2-04 [+] chaque fichier du corpus existe dans le dépôt", () => {
    expect(STUDIO_CAPACITES_AVANCEES.map((c) => c.id)).toEqual(["illustration-locale", "illustration-externe", "adaptateur-mcp", "declaration-extensions"]);
    for (const c of STUDIO_CAPACITES_AVANCEES) {
      expect(studioCapaciteIncomplete(c), c.id).toEqual([]);
      for (const f of c.corpus.fichiers) expect(existsSync(new URL(`../../../../../${f}`, import.meta.url)), f).toBe(true);
    }
    // Coût jamais deviné : seul le service externe a un coût, déclaré par l'administrateur ; il est livré désactivé.
    expect(STUDIO_CAPACITES_AVANCEES.find((c) => c.id === "illustration-externe")).toMatchObject({ etat: "configurable", couts: { nature: "declare-par-administrateur" }, confidentialite: { transfertExterne: true } });
  });
  it("F.2-01 [−] une rubrique vide rend la capacité incomplète", () => {
    const c = structuredClone(STUDIO_CAPACITES_AVANCEES[1]!);
    expect(studioCapaciteIncomplete({ ...c, couts: { ...c.couts, detail: "" } })).toEqual(["couts"]);
    expect(studioCapaciteIncomplete({ ...c, confidentialite: { ...c.confidentialite, donneesEnvoyees: [] } })).toEqual(["confidentialite"]);
    expect(studioCapaciteIncomplete({ ...c, corpus: { fichiers: [], cas: [] } })).toEqual(["corpus"]);
  });
});
