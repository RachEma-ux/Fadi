/**
 * Scénario hors ligne contre le vrai serveur (cahier §7, lot 2, L2.5 « file rejouée après coupure ») : le bus local
 * fusionné (`apps/web/src/modules/atelier/bus/bus.ts`, file en mémoire) et le client fusionné
 * (`creerClientAtelierCommandes`) parlent à la vraie application (supertest), sur PostgreSQL. Seule la coupure est
 * simulée : une `requete` qui lève une `TypeError` (comme `fetch` sans réseau) et une source de joignabilité pilotée.
 *
 * 1. A est acceptée par le serveur mais sa réponse est perdue (coupure pendant l'envoi) ;
 * 2. hors ligne : B puis C mises en file, `baseRevision` chaînées localement ;
 * 3. retour en ligne : A, B, C rejouées dans l'ordre — A rend la réponse enregistrée (même requestId, aucune nouvelle
 *    révision), B et C s'appliquent ; révision finale, journal et empreinte exacts ;
 * 4. D construite hors ligne sur une base que dépasse entre-temps l'écriture d'un autre compte → 409 détaillé, D
 *    « en conflit » en tête de file.
 *
 * Les modules d'apps/web sont chargés par `import()` dynamique (vitest/vite les résout, extensions comprises) :
 * un import statique ferait compiler le code du navigateur par le `tsconfig` de l'API (NodeNext, `rootDir: src`).
 * Les types utilisés sont donc redéclarés ici, au plus juste. `joignabilite.ts` n'est pas chargé (il dépend de
 * `lib/reachability` côté navigateur) : la source de joignabilité est fournie par le test.
 *
 * Schéma jetable comme commands.atelier-api.test.ts ; ignoré sans DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { longueur, pointLocal, type Commande, type EtatModele } from "@parcours/atelier-model";

type Agent = ReturnType<typeof request.agent>;
type Joignabilite = "en-ligne" | "hors-ligne" | "injoignable";
type Requete = <T>(chemin: string, init?: RequestInit) => Promise<T>;

interface SourceJoignabilite {
  etat(): Joignabilite;
  subscribe(fn: () => void): () => void;
}
interface EntreeFile {
  readonly requestId: string;
  readonly enveloppe: { readonly baseRevision: number; readonly label: string };
  readonly etat: "en-attente" | "envoyee" | "en-conflit";
  readonly tentatives: number;
  readonly conflit: { readonly reponse: { baseRevision: number; revisionCourante: number; conflits: { objetId: string; motif: string; etatServeur: { id: string } | null }[] } } | null;
}
type ResultatExecution = { readonly ok: true; readonly requestId: string; readonly etat: EtatModele } | { readonly ok: false; readonly erreurs: readonly unknown[] };
interface Bus {
  ouvrir(): Promise<void>;
  fermer(): void;
  executer(label: string, commands: readonly Commande[]): Promise<ResultatExecution>;
  synchroniser(): Promise<void>;
  entrees(): readonly EntreeFile[];
  etatDe(requestId: string): string | null;
  etatLocal(): EtatModele | null;
  etatConfirme(): EtatModele | null;
  resume(): { enAttente: number; conflits: number; revisionConfirmee: number | null; revisionLocale: number | null };
  on(nom: string, fn: (v: unknown) => void): () => void;
}
interface ModulesWeb {
  BusAtelier: new (o: { projectId: string; transport: unknown; stockage: unknown; joignabilite: SourceJoignabilite }) => Bus;
  stockageMemoire: () => unknown;
  creerClientAtelierCommandes: (r: Requete) => unknown;
  ApiError: new (status: number, code: string, message: string | null, body: unknown) => Error;
}

const URL_BASE = process.env["DATABASE_URL"];
const SCHEMA = `atelier_hors_ligne_${process.pid}_${Date.now()}`;
const INIT_SQL = readFileSync(new URL("./db/init.sql", import.meta.url), "utf8");
const WEB = new URL("../../web/src/", import.meta.url);

let app: ReturnType<(typeof import("./app.js"))["createApp"]>;
let admin: Pool;
let poolApp: Pool;
let web: ModulesWeb;

async function charger<T>(chemin: string): Promise<T> {
  return (await import(/* @vite-ignore */ new URL(chemin, WEB).pathname)) as T;
}

const m = longueur;
const P = pointLocal;
const cmd = (type: string, params: Record<string, unknown>, cibles: string[] = []) => ({ type, params, cibles }) as unknown as Commande;
const NIVEAU = cmd("niveau.creer", { id: "rdc", nom: "Rez", elevation: m(0), hauteur: m(3), ordre: 0 });
const CALQUE = cmd("calque.creer", { id: "C1", nom: "Murs", couleur: "#336699", visible: true, verrouille: false, ordre: 0 });
const mur = (id: string, x: number) =>
  cmd("mur.tracer", { id, niveauId: "rdc", calqueId: "C1", a: P(x, 0), b: P(x, 6), epaisseur: m(0.2), hauteur: m(3), alignement: "axe", typeId: "non-type", exterieur: true });

/** Joignabilité pilotée par le test (comme `joignabiliteManuelle`). */
function joignabilitePilotee(): SourceJoignabilite & { definir(e: Joignabilite): void } {
  let courante: Joignabilite = "en-ligne";
  const ecouteurs = new Set<() => void>();
  return {
    etat: () => courante,
    subscribe(fn) {
      ecouteurs.add(fn);
      return () => ecouteurs.delete(fn);
    },
    definir(e) {
      if (e === courante) return;
      courante = e;
      for (const fn of [...ecouteurs]) fn();
    },
  };
}

/**
 * `requete` du client fusionné vers la vraie application, avec la sémantique de `lib/api/http.ts` (`ApiError` sur un
 * statut d'échec, `TypeError` sans réponse). `coupe` : aucune requête ne part ; `perdreReponse` : la prochaine
 * écriture part et le serveur la traite, mais la réponse n'arrive jamais (coupure pendant l'envoi).
 */
function requeteVers(agent: Agent, reseau: { coupe: boolean; perdreReponse: boolean; envois: string[]; surCoupure: () => void }): Requete {
  return async <T>(chemin: string, init?: RequestInit): Promise<T> => {
    if (reseau.coupe) throw new TypeError("Failed to fetch");
    const methode = (init?.method ?? "GET").toUpperCase();
    const r = methode === "POST" ? await agent.post(chemin).set("content-type", "application/json").send(String(init?.body ?? "")) : await agent.get(chemin);
    if (methode === "POST") reseau.envois.push(JSON.parse(String(init?.body ?? "{}")).requestId as string);
    if (methode === "POST" && reseau.perdreReponse) {
      reseau.perdreReponse = false;
      reseau.coupe = true;
      reseau.surCoupure();
      throw new TypeError("Failed to fetch (réponse perdue)");
    }
    const body: unknown = r.body;
    if (r.status >= 400) {
      const o = (body ?? {}) as Record<string, unknown>;
      throw new web.ApiError(r.status, typeof o["error"] === "string" ? o["error"] : `http_${r.status}`, typeof o["message"] === "string" ? o["message"] : null, body);
    }
    return body as T;
  };
}

async function compte(email: string) {
  const a = request.agent(app);
  expect((await a.post("/auth/register").send({ email, password: "correct-horse-battery" })).status).toBe(201);
  return a;
}

const ok = (r: ResultatExecution) => {
  if (!r.ok) throw new Error(`refus local inattendu : ${JSON.stringify(r.erreurs)}`);
  return r;
};

describe.skipIf(!URL_BASE)("file hors ligne du bus rejouée contre le vrai serveur (§7 lot 2, L2.5)", () => {
  beforeAll(async () => {
    admin = new Pool({ connectionString: URL_BASE });
    await admin.query(`CREATE SCHEMA "${SCHEMA}"`);
    const local = new Pool({ connectionString: URL_BASE, options: `-c search_path=${SCHEMA},public` });
    await local.query(INIT_SQL);
    await local.end();
    const url = new URL(URL_BASE!);
    url.searchParams.set("options", `-c search_path=${SCHEMA},public`);
    process.env["DATABASE_URL"] = url.toString();
    app = (await import("./app.js")).createApp();
    poolApp = (await import("./db/client.js")).pool;
    expect((await poolApp.query("SHOW search_path")).rows[0].search_path as string).toContain(SCHEMA);
    const [bus, stockage, client, http] = await Promise.all([
      charger<Pick<ModulesWeb, "BusAtelier">>("modules/atelier/bus/bus.ts"),
      charger<Pick<ModulesWeb, "stockageMemoire">>("modules/atelier/bus/stockage.ts"),
      charger<Pick<ModulesWeb, "creerClientAtelierCommandes">>("lib/api/atelier-commandes.ts"),
      charger<Pick<ModulesWeb, "ApiError">>("lib/api/http.ts"),
    ]);
    web = { BusAtelier: bus.BusAtelier, stockageMemoire: stockage.stockageMemoire, creerClientAtelierCommandes: client.creerClientAtelierCommandes, ApiError: http.ApiError };
  }, 120_000);

  afterAll(async () => {
    await poolApp?.end();
    await admin?.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await admin?.end();
  });

  it("A acceptée sans réponse, B et C en file hors ligne, rejeu dans l'ordre ; D sur base périmée → 409, en conflit", async () => {
    const alice = await compte("hl-alice@atelier.test");
    const bruno = await compte("hl-bruno@atelier.test");
    const projet = (await alice.post("/projects").send({ code: "HL", name: "Hors ligne" })).body.id as string;
    expect((await alice.post(`/projects/${projet}/members`).send({ email: "hl-bruno@atelier.test", role: "editeur" })).status).toBe(201);
    const A_ = `/projects/${projet}/atelier`;

    const joignabilite = joignabilitePilotee();
    const reseau = { coupe: false, perdreReponse: false, envois: [] as string[], surCoupure: () => joignabilite.definir("injoignable") };
    const bus = new web.BusAtelier({ projectId: projet, transport: web.creerClientAtelierCommandes(requeteVers(alice, reseau)), stockage: web.stockageMemoire(), joignabilite });
    const evenements: { nom: string; v: unknown }[] = [];
    for (const nom of ["lot-accepte", "lot-refuse", "conflit", "lot-reporte"]) bus.on(nom, (v) => evenements.push({ nom, v }));
    await bus.ouvrir();
    const prep = ok(await bus.executer("Préparer", [NIVEAU, CALQUE]));
    await bus.synchroniser();
    expect(bus.etatDe(prep.requestId)).toBe("acceptee");
    const r0 = bus.etatConfirme()!.revision;
    expect(r0).toBe(1);

    // 1. A part, le serveur l'accepte, la réponse est perdue : A reste en file (tentée une fois), serveur injoignable.
    reseau.perdreReponse = true;
    const a = ok(await bus.executer("Mur A", [mur("MA", 0)]));
    await bus.synchroniser();
    expect(bus.etatDe(a.requestId)).toBe("en-attente");
    expect(bus.entrees()).toMatchObject([{ requestId: a.requestId, tentatives: 1, enveloppe: { baseRevision: r0 } }]);
    expect((await alice.get(`${A_}/model`)).body.revision).toBe(r0 + 1); // le serveur l'a bien appliquée

    // 2. Hors ligne : B puis C en file, bases chaînées sur l'état local (A optimiste comprise).
    joignabilite.definir("hors-ligne");
    const b = ok(await bus.executer("Mur B", [mur("MB", 2)]));
    const c = ok(await bus.executer("Mur C", [mur("MC", 4)]));
    expect(bus.entrees().map((e) => [e.requestId, e.enveloppe.baseRevision])).toEqual([
      [a.requestId, r0],
      [b.requestId, r0 + 1],
      [c.requestId, r0 + 2],
    ]);
    expect(bus.etatLocal()!.revision).toBe(r0 + 3);
    expect(Object.keys(bus.etatLocal()!.objets)).toEqual(expect.arrayContaining(["MA", "MB", "MC"]));
    const envoisAvant = reseau.envois.length;

    // 3. Retour en ligne : rejeu A (même requestId → réponse enregistrée), puis B, puis C.
    reseau.coupe = false;
    joignabilite.definir("en-ligne");
    await bus.synchroniser();
    expect(reseau.envois.slice(envoisAvant)).toEqual([a.requestId, b.requestId, c.requestId]);
    for (const id of [a.requestId, b.requestId, c.requestId]) expect(bus.etatDe(id)).toBe("acceptee");
    expect(bus.entrees()).toHaveLength(0);
    const acceptes = evenements.filter((e) => e.nom === "lot-accepte").map((e) => (e.v as { requestId: string; reponse: { revision: number } }).reponse.revision);
    expect(acceptes).toEqual([r0, r0 + 1, r0 + 2, r0 + 3]); // Préparer, A (réponse enregistrée : r0 + 1), B, C
    expect(evenements.filter((e) => e.nom === "lot-refuse" || e.nom === "conflit")).toEqual([]);
    const serveur = (await alice.get(`${A_}/model`)).body as EtatModele;
    expect(serveur.revision).toBe(r0 + 3);
    expect(bus.etatConfirme()!.empreinte).toBe(serveur.empreinte);
    expect(bus.etatLocal()!.empreinte).toBe(serveur.empreinte);
    const journal = (await alice.get(`${A_}/journal`)).body as { revisionCourante: number; entrees: { requestId: string; nature: string }[] };
    expect(journal.revisionCourante).toBe(r0 + 3);
    // initialisation + Préparer + A + B + C : A n'a qu'une entrée malgré ses deux envois.
    expect(journal.entrees.map((e) => e.requestId)).toEqual(["initialisation", prep.requestId, a.requestId, b.requestId, c.requestId]);
    const nA = await poolApp.query("SELECT count(*)::int AS n FROM atelier_commands WHERE project_id = $1 AND request_id = $2", [projet, a.requestId]);
    expect(nA.rows[0].n).toBe(1);

    // 4. D hors ligne sur r0 + 3 ; Bruno écrit entre-temps ; au retour, D reçoit un 409 détaillé et bloque la file.
    reseau.coupe = true;
    joignabilite.definir("hors-ligne");
    const d = ok(await bus.executer("Mur D", [mur("MD", 6)]));
    const rb = await bruno.post(`${A_}/commands`).send({ requestId: `hl-bruno-${Date.now()}`, baseRevision: r0 + 3, contract: "atelier-commands/1", label: "Mur de Bruno", commands: [mur("MX", 8)] });
    expect(rb.status).toBe(200);
    reseau.coupe = false;
    joignabilite.definir("en-ligne");
    await bus.synchroniser();
    expect(bus.etatDe(d.requestId)).toBe("en-conflit");
    const [tete] = bus.entrees();
    expect(tete).toMatchObject({ requestId: d.requestId, etat: "en-conflit", enveloppe: { baseRevision: r0 + 3 } });
    expect(tete!.conflit!.reponse).toMatchObject({ baseRevision: r0 + 3, revisionCourante: r0 + 4 });
    expect(tete!.conflit!.reponse.conflits).toEqual([expect.objectContaining({ objetId: "MX", motif: expect.stringContaining("Mur de Bruno"), etatServeur: expect.objectContaining({ id: "MX" }) })]);
    expect(evenements.filter((e) => e.nom === "conflit")).toHaveLength(1);
    expect(bus.resume()).toMatchObject({ conflits: 1, revisionConfirmee: r0 + 4 });
    expect((await alice.get(`${A_}/model`)).body.revision).toBe(r0 + 4); // rien d'appliqué pour D
    bus.fermer();
  }, 60_000);
});
