/**
 * BD-9.1 : stockage des fichiers (base ou objet S3). Service S3 simulé (aucun réseau), base simulée pour la reprise.
 */
import { createHash } from "node:crypto";
import { PassThrough, Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it } from "vitest";
import type { Response } from "express";
import { ConfigStockageInvalide, lireConfigStockage } from "./config.js";
import { CLE_OBJET, cleObjet, contenuFichier, definirStockageFichiers, envoyerFichier, rangerFichier } from "./index.js";
import { FichierCorrompu, sha256Hex, verificateurSha256, type PiloteObjet } from "./pilote.js";
import { nettoyerObjetsOrphelins, reprendreFichiers, type Requeteur } from "./reprise.js";
import { piloteS3, type EnvoyeurS3 } from "./s3.js";

const S3_COMPLET = {
  FADI_S3_ENDPOINT: "https://s3.exemple.invalid", FADI_S3_REGION: "region-test", FADI_S3_BUCKET: "fadi-test",
  FADI_S3_ACCESS_KEY_ID: "id-test", FADI_S3_SECRET_ACCESS_KEY: "secret-test",
};

/** Service S3 en mémoire, au niveau des commandes du SDK (ce que `S3Client.send` reçoit). */
class S3Simule implements EnvoyeurS3 {
  objets = new Map<string, { corps: Buffer; meta: Record<string, string>; date: Date; type?: string | undefined }>();
  commandes: string[] = [];
  /** Altère le contenu servi (simulation de corruption). */
  alterer = false;
  async send(c: unknown): Promise<unknown> {
    const nonTrouve = () => Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
    if (c instanceof PutObjectCommand) {
      const i = c.input;
      const corps = Buffer.from(i.Body as Buffer);
      this.commandes.push(`put ${i.Key}`);
      expect(i.Bucket).toBe("fadi-test");
      expect(i.ContentMD5).toBe(createHash("md5").update(corps).digest("base64"));
      expect(i.ContentLength).toBe(corps.length);
      this.objets.set(i.Key!, { corps, meta: { ...(i.Metadata ?? {}) }, date: new Date(), type: i.ContentType });
      return {};
    }
    if (c instanceof GetObjectCommand) {
      const o = this.objets.get(c.input.Key!);
      this.commandes.push(`get ${c.input.Key}`);
      if (!o) throw Object.assign(new Error("NoSuchKey"), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });
      const corps = this.alterer ? Buffer.concat([o.corps.subarray(0, -1), Buffer.from("!")]) : o.corps;
      const flux = Readable.from([corps.subarray(0, Math.ceil(corps.length / 2)), corps.subarray(Math.ceil(corps.length / 2))]);
      return { Body: Object.assign(flux, { transformToByteArray: async () => new Uint8Array(corps) }), ContentLength: corps.length, Metadata: o.meta };
    }
    if (c instanceof HeadObjectCommand) {
      const o = this.objets.get(c.input.Key!);
      if (!o) throw nonTrouve();
      return { ContentLength: o.corps.length, Metadata: o.meta, LastModified: o.date };
    }
    if (c instanceof DeleteObjectCommand) {
      this.commandes.push(`delete ${c.input.Key}`);
      this.objets.delete(c.input.Key!);
      return {};
    }
    if (c instanceof ListObjectsV2Command) {
      const cles = [...this.objets.keys()].filter((k) => k.startsWith(c.input.Prefix ?? "")).sort();
      return { Contents: cles.map((k) => ({ Key: k, Size: this.objets.get(k)!.corps.length, LastModified: this.objets.get(k)!.date })), IsTruncated: false };
    }
    if (c instanceof HeadBucketCommand) return {};
    throw new Error("commande inattendue");
  }
}

afterEach(() => definirStockageFichiers(null));

describe("BD-9.1 — configuration du stockage", () => {
  it("défaut : écriture en base, aucun S3", () => {
    expect(lireConfigStockage({})).toEqual({ ecriture: "base", s3: null });
    expect(lireConfigStockage({ FADI_STOCKAGE: "base" })).toEqual({ ecriture: "base", s3: null });
  });

  it("s3 complet : configuration lue, adressage chemin par défaut", () => {
    const c = lireConfigStockage({ FADI_STOCKAGE: "s3", ...S3_COMPLET });
    expect(c.ecriture).toBe("s3");
    expect(c.s3).toMatchObject({ endpoint: "https://s3.exemple.invalid", region: "region-test", bucket: "fadi-test", forcePathStyle: true });
    expect(lireConfigStockage({ FADI_STOCKAGE: "s3", ...S3_COMPLET, FADI_S3_FORCE_PATH_STYLE: "0" }).s3?.forcePathStyle).toBe(false);
  });

  it("refus explicites, sans jamais citer une valeur secrète", () => {
    const refus = (env: Record<string, string>) => {
      try {
        lireConfigStockage(env);
      } catch (e) {
        expect(e).toBeInstanceOf(ConfigStockageInvalide);
        expect((e as Error).message).not.toContain("secret-test");
        return (e as Error).message;
      }
      throw new Error("aucun refus");
    };
    expect(refus({ FADI_STOCKAGE: "disque" })).toMatch(/« base » ou « s3 »/);
    expect(refus({ FADI_STOCKAGE: "s3" })).toMatch(/FADI_S3_ENDPOINT, FADI_S3_REGION, FADI_S3_BUCKET, FADI_S3_ACCESS_KEY_ID, FADI_S3_SECRET_ACCESS_KEY/);
    expect(refus({ FADI_S3_BUCKET: "fadi-test", FADI_S3_SECRET_ACCESS_KEY: "secret-test" })).toMatch(/partielle.*FADI_S3_ENDPOINT/);
    expect(refus({ FADI_STOCKAGE: "s3", ...S3_COMPLET, FADI_S3_ENDPOINT: "pas une adresse" })).toMatch(/adresse valide/);
    expect(refus({ FADI_STOCKAGE: "s3", ...S3_COMPLET, FADI_S3_ENDPOINT: "http://s3.exemple.invalid", NODE_ENV: "production" })).toMatch(/https:\/\/ en production/);
    expect(refus({ FADI_STOCKAGE: "s3", ...S3_COMPLET, FADI_S3_ENDPOINT: "https://a:b@s3.exemple.invalid" })).toMatch(/identifiants/);
    expect(refus({ FADI_STOCKAGE: "s3", ...S3_COMPLET, FADI_S3_BUCKET: "Mauvais_Nom" })).toMatch(/compartiment invalide/);
    expect(refus({ FADI_STOCKAGE: "s3", ...S3_COMPLET, FADI_S3_FORCE_PATH_STYLE: "oui" })).toMatch(/0 ou 1/);
  });

  it("base avec S3 complet : écriture en base, lecture des objets possible", () => {
    const c = lireConfigStockage({ FADI_STOCKAGE: "base", ...S3_COMPLET });
    expect(c.ecriture).toBe("base");
    expect(c.s3?.bucket).toBe("fadi-test");
  });
});

const octets = Buffer.from("contenu de fichier de test, BD-9.1");
const sha = sha256Hex(octets);

describe("BD-9.1 — rangement et lecture", () => {
  it("clé adressée par le contenu", () => {
    expect(cleObjet("step_files", sha)).toBe(`step_files/${sha.slice(0, 2)}/${sha}`);
    expect(CLE_OBJET.test(cleObjet("volumes", sha))).toBe(true);
    expect(() => cleObjet("volumes", "abc")).toThrow();
  });

  it("pilote base : le contenu reste dans la ligne, aucun appel S3", async () => {
    const s3 = new S3Simule();
    definirStockageFichiers({ config: { ecriture: "base", s3: null }, objet: piloteS3(s3, "fadi-test") });
    const r = await rangerFichier("step_files", octets, "text/plain");
    expect(r).toEqual({ content: octets, objetCle: null, sha256: sha });
    expect(s3.commandes).toEqual([]);
    expect(await contenuFichier(r, { sha256: sha, taille: octets.length })).toEqual(octets);
  });

  it("pilote s3 : objet déposé avec MD5 et SHA-256, la ligne ne garde que la clé", async () => {
    const s3 = new S3Simule();
    definirStockageFichiers({ config: { ecriture: "s3", s3: null }, objet: piloteS3(s3, "fadi-test") });
    const r = await rangerFichier("drawing_exports", octets, "image/png");
    expect(r.content).toBeNull();
    expect(r.objetCle).toBe(cleObjet("drawing_exports", sha));
    expect(s3.objets.get(r.objetCle!)?.meta).toEqual({ sha256: sha });
    expect(s3.objets.get(r.objetCle!)?.type).toBe("image/png");
    expect(await contenuFichier(r, { sha256: sha, taille: octets.length })).toEqual(octets);
  });

  it("lecture : écart d'empreinte ou de taille refusé, objet sans configuration S3 refusé", async () => {
    await expect(contenuFichier({ content: octets, objetCle: null }, { sha256: "0".repeat(64) })).rejects.toBeInstanceOf(FichierCorrompu);
    await expect(contenuFichier({ content: octets, objetCle: null }, { taille: 3 })).rejects.toBeInstanceOf(FichierCorrompu);
    const s3 = new S3Simule();
    definirStockageFichiers({ config: { ecriture: "s3", s3: null }, objet: piloteS3(s3, "fadi-test") });
    const r = await rangerFichier("volumes", octets, "application/pdf");
    s3.alterer = true;
    await expect(contenuFichier(r, { sha256: sha })).rejects.toBeInstanceOf(FichierCorrompu);
    definirStockageFichiers({ config: { ecriture: "base", s3: null }, objet: null });
    await expect(contenuFichier(r, { sha256: sha })).rejects.toThrow(/stockage_objet_non_configure/);
  });
});

/** Réponse Express minimale : un flux inscriptible qui garde les en-têtes et les octets reçus. */
function reponse() {
  const flux = new PassThrough();
  const morceaux: Buffer[] = [];
  flux.on("data", (c: Buffer) => morceaux.push(c));
  const entetes: Record<string, string> = {};
  let detruite = false;
  const res = Object.assign(flux, {
    headersSent: false,
    setHeader(n: string, v: string) { entetes[n.toLowerCase()] = v; },
    end: flux.end.bind(flux),
  });
  const origDestroy = flux.destroy.bind(flux);
  (res as { destroy: (e?: Error) => unknown }).destroy = (e?: Error) => { detruite = true; return origDestroy(e); };
  flux.on("data", () => { res.headersSent = true; });
  return { res: res as unknown as Response, entetes, corps: () => Buffer.concat(morceaux), detruite: () => detruite };
}

describe("BD-9.1 — envoi en flux", () => {
  it("objet servi en flux, longueur posée, contenu intact", async () => {
    const s3 = new S3Simule();
    definirStockageFichiers({ config: { ecriture: "s3", s3: null }, objet: piloteS3(s3, "fadi-test") });
    const r = await rangerFichier("step_files", octets, "text/plain");
    const rep = reponse();
    await envoyerFichier(rep.res, r, { sha256: sha, taille: octets.length });
    expect(rep.entetes["content-length"]).toBe(String(octets.length));
    expect(rep.corps()).toEqual(octets);
  });

  it("contenu en base : fonction d'envoi d'origine", async () => {
    let envoye: Buffer | null = null;
    await envoyerFichier(reponse().res, { content: octets, objetCle: null }, { sha256: sha }, (b) => { envoye = b; });
    expect(envoye).toEqual(octets);
  });

  it("objet altéré : le dernier morceau n'est jamais envoyé, la réponse est interrompue", async () => {
    const s3 = new S3Simule();
    definirStockageFichiers({ config: { ecriture: "s3", s3: null }, objet: piloteS3(s3, "fadi-test") });
    const r = await rangerFichier("step_files", octets, "text/plain");
    s3.alterer = true;
    const rep = reponse();
    const erreurs: string[] = [];
    const orig = console.error;
    console.error = (m: string) => void erreurs.push(m);
    try {
      await envoyerFichier(rep.res, r, { sha256: sha, taille: octets.length });
    } finally {
      console.error = orig;
    }
    expect(rep.corps().length).toBeLessThan(octets.length);
    expect(rep.detruite()).toBe(true);
    expect(erreurs.join()).toMatch(/fichier_flux_interrompu/);
  });

  it("taille de l'objet différente de la base : refus avant tout envoi", async () => {
    const s3 = new S3Simule();
    definirStockageFichiers({ config: { ecriture: "s3", s3: null }, objet: piloteS3(s3, "fadi-test") });
    const r = await rangerFichier("com_pieces", octets, "image/png");
    const rep = reponse();
    await expect(envoyerFichier(rep.res, r, { sha256: sha, taille: octets.length + 1 })).rejects.toBeInstanceOf(FichierCorrompu);
    expect(rep.corps().length).toBe(0);
  });

  it("vérificateur : retient le dernier morceau jusqu'au contrôle", async () => {
    const v = verificateurSha256(sha, octets.length);
    const recu: Buffer[] = [];
    v.on("data", (c: Buffer) => recu.push(c));
    v.write(octets.subarray(0, 5));
    v.write(octets.subarray(5));
    await new Promise((r) => setImmediate(r));
    expect(Buffer.concat(recu).length).toBe(5);
    v.end();
    await new Promise((r) => v.on("end", r));
    expect(Buffer.concat(recu)).toEqual(octets);
  });
});

/** Base simulée : quatre tables, lignes en mémoire ; seules les requêtes de la reprise sont reconnues. */
class BaseSimulee implements Requeteur {
  tables: Record<string, Map<string, { content: Buffer | null; objet_cle: string | null; size: number; mime: string; empreinte: string | null }>> = {
    step_files: new Map(), drawing_exports: new Map(), volumes: new Map(), com_pieces: new Map(),
  };
  /** Simule une écriture concurrente juste avant l'UPDATE. */
  avantMaj: (() => void) | null = null;
  async query<R extends Record<string, unknown>>(texte: string, v: unknown[] = []): Promise<{ rows: R[]; rowCount: number | null }> {
    const t = /(?:FROM|UPDATE) (\w+)/.exec(texte)![1]!;
    const lignes = this.tables[t]!;
    const enBase = [...lignes].filter(([, l]) => l.content !== null && l.objet_cle === null);
    const res = (rows: unknown[], rowCount = rows.length) => ({ rows: rows as R[], rowCount });
    if (texte.startsWith("SELECT count(*)")) return res([{ n: String(enBase.length), o: enBase.length ? String(enBase.reduce((s, [, l]) => s + l.content!.length, 0)) : null }]);
    if (texte.startsWith("SELECT id FROM")) return res(enBase.map(([id]) => id).filter((id) => id > (v[0] as string)).sort().slice(0, v[1] as number).map((id) => ({ id })));
    if (texte.startsWith("SELECT content, size")) {
      const l = lignes.get(v[0] as string);
      return res(l && l.content && !l.objet_cle ? [{ content: l.content, size: l.size, mime: l.mime, empreinte: t === "volumes" ? v[0] : l.empreinte }] : []);
    }
    if (texte.startsWith("UPDATE")) {
      this.avantMaj?.();
      const l = lignes.get(v[0] as string);
      if (!l || l.objet_cle || !l.content || l.content.length !== v[3] || sha256Hex(l.content) !== v[2]) return res([], 0);
      l.objet_cle = v[1] as string;
      if (texte.includes("empreinte = $3")) l.empreinte = v[2] as string;
      l.content = null;
      return res([], 1);
    }
    if (texte.startsWith("SELECT DISTINCT objet_cle")) return res([...lignes.values()].filter((l) => l.objet_cle && (v[0] as string[]).includes(l.objet_cle)).map((l) => ({ c: l.objet_cle })));
    if (texte.startsWith("SELECT 1 FROM")) return res([...lignes.values()].filter((l) => l.objet_cle === v[0]).map(() => ({ "?column?": 1 })));
    throw new Error(`requête inattendue : ${texte}`);
  }
}

const ligne = (content: Buffer, mime = "application/octet-stream", empreinte: string | null = null) => ({ content, objet_cle: null, size: content.length, mime, empreinte });

describe("BD-9.1 — reprise vers le stockage objet", () => {
  it("essai par défaut : bilan seulement, rien n'est déposé ni modifié", async () => {
    const base = new BaseSimulee();
    base.tables["step_files"]!.set("a", ligne(octets));
    const s3 = new S3Simule();
    const bilan = await reprendreFichiers(base, piloteS3(s3, "fadi-test"), { appliquer: false });
    expect(bilan.find((b) => b.table === "step_files")).toMatchObject({ restantes: 1, octetsRestants: octets.length, deplacees: 0 });
    expect(s3.commandes).toEqual([]);
    expect(base.tables["step_files"]!.get("a")!.content).toEqual(octets);
  });

  it("applique par lots, vérifie l'objet relu, vide le bytea ; relance sans effet (idempotente)", async () => {
    const base = new BaseSimulee();
    for (let i = 0; i < 7; i++) base.tables["step_files"]!.set(`f${i}`, ligne(Buffer.from(`fichier ${i}`), "text/plain"));
    const vol = Buffer.from("volume");
    base.tables["volumes"]!.set(sha256Hex(vol), ligne(vol, "application/pdf"));
    const s3 = new S3Simule();
    const pilote = piloteS3(s3, "fadi-test");
    const bilan = await reprendreFichiers(base, pilote, { appliquer: true, lot: 3 });
    expect(bilan.find((b) => b.table === "step_files")).toMatchObject({ deplacees: 7, restantes: 0, ignorees: [] });
    expect(bilan.find((b) => b.table === "volumes")).toMatchObject({ deplacees: 1, restantes: 0 });
    const f0 = base.tables["step_files"]!.get("f0")!;
    expect(f0.content).toBeNull();
    expect(f0.empreinte).toBe(sha256Hex(Buffer.from("fichier 0")));
    expect(f0.objet_cle).toBe(cleObjet("step_files", f0.empreinte!));
    expect(s3.objets.get(f0.objet_cle!)!.corps).toEqual(Buffer.from("fichier 0"));
    // Chaque dépôt est relu avant de vider la ligne.
    expect(s3.commandes.filter((c) => c.startsWith("get")).length).toBe(8);
    const deposes = s3.commandes.length;
    const encore = await reprendreFichiers(base, pilote, { appliquer: true });
    expect(encore.every((b) => b.deplacees === 0 && b.restantes === 0)).toBe(true);
    expect(s3.commandes.length).toBe(deposes);
  });

  it("borne --max et filtre de table", async () => {
    const base = new BaseSimulee();
    for (let i = 0; i < 5; i++) base.tables["com_pieces"]!.set(`p${i}`, ligne(Buffer.from(`photo ${i}`), "image/png", sha256Hex(Buffer.from(`photo ${i}`))));
    base.tables["step_files"]!.set("a", ligne(octets));
    const bilan = await reprendreFichiers(base, piloteS3(new S3Simule(), "fadi-test"), { appliquer: true, max: 2, tables: ["com_pieces"] });
    expect(bilan).toHaveLength(1);
    expect(bilan[0]).toMatchObject({ table: "com_pieces", deplacees: 2, restantes: 3 });
    expect(base.tables["step_files"]!.get("a")!.content).toEqual(octets);
  });

  it("lignes incohérentes ou objet relu différent : signalées, laissées en base", async () => {
    const base = new BaseSimulee();
    base.tables["com_pieces"]!.set("mauvaise-empreinte", ligne(octets, "image/png", "0".repeat(64)));
    base.tables["drawing_exports"]!.set("mauvaise-taille", { ...ligne(octets), size: 1 });
    const s3 = new S3Simule();
    const bilan = await reprendreFichiers(base, piloteS3(s3, "fadi-test"), { appliquer: true });
    expect(bilan.find((b) => b.table === "com_pieces")!.ignorees[0]!.motif).toMatch(/empreinte/);
    expect(bilan.find((b) => b.table === "drawing_exports")!.ignorees[0]!.motif).toMatch(/taille/);
    expect(s3.commandes).toEqual([]);

    const b2 = new BaseSimulee();
    b2.tables["step_files"]!.set("a", ligne(octets));
    const s3b = new S3Simule();
    s3b.alterer = true;
    const r2 = await reprendreFichiers(b2, piloteS3(s3b, "fadi-test"), { appliquer: true });
    expect(r2.find((b) => b.table === "step_files")).toMatchObject({ deplacees: 0, restantes: 1 });
    expect(b2.tables["step_files"]!.get("a")!.content).toEqual(octets);
  });

  it("ligne modifiée pendant la reprise : UPDATE conditionnel sans effet", async () => {
    const base = new BaseSimulee();
    base.tables["step_files"]!.set("a", ligne(octets));
    base.avantMaj = () => { base.tables["step_files"]!.get("a")!.content = Buffer.from("autre"); };
    const bilan = await reprendreFichiers(base, piloteS3(new S3Simule(), "fadi-test"), { appliquer: true });
    expect(bilan.find((b) => b.table === "step_files")!.ignorees[0]!.motif).toMatch(/modifiée/);
    expect(base.tables["step_files"]!.get("a")!.objet_cle).toBeNull();
  });

  it("appliquer sans stockage objet : refus", async () => {
    await expect(reprendreFichiers(new BaseSimulee(), null, { appliquer: true })).rejects.toThrow(/non configuré/);
  });
});

describe("BD-9.1 — objets orphelins", () => {
  it("compte en essai ; supprime seulement les objets anciens qu'aucune ligne ne cite", async () => {
    const base = new BaseSimulee();
    const s3 = new S3Simule();
    const pilote: PiloteObjet = piloteS3(s3, "fadi-test");
    const vieux = new Date("2026-10-01T00:00:00Z");
    const cite = cleObjet("step_files", sha256Hex(Buffer.from("cité")));
    const orphelin = cleObjet("step_files", sha256Hex(Buffer.from("orphelin")));
    const recent = cleObjet("step_files", sha256Hex(Buffer.from("récent")));
    s3.objets.set(cite, { corps: Buffer.from("cité"), meta: {}, date: vieux });
    s3.objets.set(orphelin, { corps: Buffer.from("orphelin"), meta: {}, date: vieux });
    s3.objets.set(recent, { corps: Buffer.from("récent"), meta: {}, date: new Date("2026-11-02T11:00:00Z") });
    base.tables["step_files"]!.set("a", { content: null, objet_cle: cite, size: 5, mime: "text/plain", empreinte: null });
    const maintenant = new Date("2026-11-02T12:00:00Z");
    const essai = await nettoyerObjetsOrphelins(base, pilote, { appliquer: false, maintenant, tables: ["step_files"] });
    expect(essai[0]).toMatchObject({ examines: 3, orphelins: 1, supprimes: 0, recents: 1 });
    expect(s3.objets.size).toBe(3);
    const fait = await nettoyerObjetsOrphelins(base, pilote, { appliquer: true, maintenant, tables: ["step_files"] });
    expect(fait[0]).toMatchObject({ orphelins: 1, supprimes: 1 });
    expect([...s3.objets.keys()].sort()).toEqual([cite, recent].sort());
  });
});
