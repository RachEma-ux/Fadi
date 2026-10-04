import { describe, expect, it } from "vitest";
import { sourceConflits, sourceSynchro } from "./adaptateurs";
import { BusAtelier, type TransportAtelier } from "./bus";
import { joignabiliteManuelle } from "./joignabilite";
import { stockageMemoire, type StockageFile } from "./stockage";
import type { EvenementsBus, Joignabilite } from "./types";
import { cmd, ligne, renommerCalque, ServeurFactice } from "./__tests__/serveur-factice";

function monter(serveur: ServeurFactice, stockage: StockageFile = stockageMemoire(), initiale: Joignabilite = "en-ligne") {
  const joignabilite = joignabiliteManuelle(initiale);
  let n = 0;
  // Comme `request` (lib/api/http.ts) avec `reachability` : une écriture sans réponse déclare le serveur injoignable.
  const transport: TransportAtelier = {
    ...serveur.transport,
    envoyerCommandes: async (p, e) => {
      const r = await serveur.transport.envoyerCommandes(p, e);
      if (r.statut === "injoignable") joignabilite.definir("injoignable");
      return r;
    },
  };
  const bus = new BusAtelier({ projectId: "p", transport, stockage, joignabilite, genererId: () => `req-${++n}-${Math.random().toString(36).slice(2, 6)}`, maintenant: () => "2026-10-04T10:00:00.000Z" });
  const evenements: { nom: keyof EvenementsBus; valeur: unknown }[] = [];
  for (const nom of ["lot-accepte", "lot-refuse", "conflit", "revision-distante", "joignabilite", "lot-reporte"] as const) bus.on(nom, (valeur) => evenements.push({ nom, valeur }));
  return { bus, joignabilite, stockage, evenements };
}

/** Laisse passer les tâches en cours (envoi déclenché par un nouveau lot ou par la joignabilité). */
async function attendre(bus: BusAtelier) {
  for (let i = 0; i < 5; i++) {
    await bus.synchroniser();
    await new Promise((r) => setTimeout(r, 0));
  }
}

const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  if (!r.ok) throw new Error(`refus inattendu : ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
};

describe("bus local du nouvel Atelier", () => {
  it("applique un lot de façon optimiste puis le confirme (même réducteur que le serveur)", async () => {
    const serveur = new ServeurFactice();
    const { bus, evenements } = monter(serveur);
    await bus.ouvrir();
    const r = ok(await bus.executer("Tracer A", [ligne("A")]));
    expect(r.etat.objets.A).toBeDefined();
    expect(bus.etatDe(r.requestId)).not.toBeNull();
    await attendre(bus);
    expect(bus.etatDe(r.requestId)).toBe("acceptee");
    expect(serveur.etat.revision).toBe(2);
    expect(bus.etatConfirme()?.empreinte).toBe(serveur.etat.empreinte);
    expect(bus.etatLocal()?.empreinte).toBe(serveur.etat.empreinte);
    expect(evenements.filter((e) => e.nom === "lot-accepte")).toHaveLength(1);
  });

  it("refus local (réducteur) : rien n'est mis en file ni envoyé", async () => {
    const serveur = new ServeurFactice();
    const { bus, stockage } = monter(serveur);
    await bus.ouvrir();
    const r = await bus.executer("Modifier un objet absent", [renommerCalque("X"), cmd("esquisse.supprimer", {}, ["inconnu"])]);
    expect(r.ok).toBe(false);
    expect(bus.entrees()).toHaveLength(0);
    expect(await stockage.lister("p")).toHaveLength(0);
    expect(serveur.envois).toHaveLength(0);
  });

  it("file persistée hors ligne, rejouée dans l'ordre après rechargement et retour du réseau", async () => {
    const serveur = new ServeurFactice();
    const stockage = stockageMemoire();
    // Première ouverture en ligne : le modèle est mis en cache.
    const premier = monter(serveur, stockage);
    await premier.bus.ouvrir();
    premier.joignabilite.definir("hors-ligne");
    const ids = [];
    for (const [i, id] of ["A", "B", "C"].entries()) ids.push(ok(await premier.bus.executer(`Tracer ${id}`, [ligne(id, i * 2)])).requestId);
    expect(serveur.envois).toHaveLength(0);
    const persistees = await stockage.lister("p");
    expect(persistees.map((e) => e.requestId)).toEqual(ids);
    expect(persistees.map((e) => e.enveloppe.baseRevision)).toEqual([1, 2, 3]);
    premier.bus.fermer();

    // Rechargement de la page, toujours hors ligne : la file et l'aperçu local reviennent du stockage.
    serveur.coupure = true;
    const second = monter(serveur, stockage, "hors-ligne");
    await second.bus.ouvrir();
    expect(second.bus.entrees().map((e) => e.requestId)).toEqual(ids);
    expect(Object.keys(second.bus.etatLocal()!.objets)).toEqual(expect.arrayContaining(["A", "B", "C"]));
    expect(second.bus.etatConfirme()?.revision).toBe(1);

    // Retour du réseau : envoi dans l'ordre de saisie, une seule fois chacun.
    serveur.coupure = false;
    second.joignabilite.definir("en-ligne");
    await attendre(second.bus);
    expect(serveur.envois.map((e) => e.requestId)).toEqual(ids);
    expect(serveur.envois.map((e) => e.label)).toEqual(["Tracer A", "Tracer B", "Tracer C"]);
    expect(serveur.etat.revision).toBe(4);
    expect(ids.map((id) => second.bus.etatDe(id))).toEqual(["acceptee", "acceptee", "acceptee"]);
    expect(await stockage.lister("p")).toHaveLength(0);
    expect(second.bus.etatLocal()?.empreinte).toBe(serveur.etat.empreinte);
    expect(second.evenements.some((e) => e.nom === "joignabilite")).toBe(true);
  });

  it("coupure pendant l'envoi : le lot reste en attente puis repart au retour du serveur", async () => {
    const serveur = new ServeurFactice();
    const { bus, joignabilite, evenements } = monter(serveur);
    await bus.ouvrir();
    serveur.coupure = true;
    const { requestId } = ok(await bus.executer("Tracer A", [ligne("A")]));
    await attendre(bus);
    expect(bus.etatDe(requestId)).toBe("en-attente");
    expect(bus.entrees()[0]?.derniereErreur).toMatch(/injoignable/);
    expect(evenements.some((e) => e.nom === "lot-reporte")).toBe(true);
    joignabilite.definir("injoignable");
    serveur.coupure = false;
    joignabilite.definir("en-ligne");
    await attendre(bus);
    expect(bus.etatDe(requestId)).toBe("acceptee");
    expect(serveur.etat.revision).toBe(2);
  });

  it("idempotence : réponse perdue puis rechargement → même requestId renvoyé, une seule révision", async () => {
    const serveur = new ServeurFactice();
    const stockage = stockageMemoire();
    const premier = monter(serveur, stockage);
    await premier.bus.ouvrir();
    serveur.reponsesPerdues = 1;
    const { requestId } = ok(await premier.bus.executer("Tracer A", [ligne("A")]));
    await attendre(premier.bus);
    expect(serveur.etat.revision).toBe(2); // validé côté serveur…
    expect(premier.bus.etatDe(requestId)).toBe("en-attente"); // …mais la réponse n'est jamais arrivée
    premier.bus.fermer();

    const second = monter(serveur, stockage);
    await second.bus.ouvrir();
    await attendre(second.bus);
    expect(serveur.envois.map((e) => e.requestId)).toEqual([requestId, requestId]);
    expect(serveur.etat.revision).toBe(2);
    expect(second.bus.etatDe(requestId)).toBe("acceptee");
    expect(second.bus.entrees()).toHaveLength(0);
    expect(second.bus.etatLocal()?.empreinte).toBe(serveur.etat.empreinte);
  });

  it("refus 400 : annulation optimiste ; lot suivant indépendant recalé, lot dépendant refusé ; ordre préservé", async () => {
    const serveur = new ServeurFactice();
    const { bus, joignabilite, evenements, stockage } = monter(serveur);
    await bus.ouvrir();
    joignabilite.definir("hors-ligne");
    const a = ok(await bus.executer("Tracer A", [ligne("A")])).requestId;
    const b = ok(await bus.executer("Tracer B", [ligne("B", 3)])).requestId;
    const c = ok(await bus.executer("Supprimer A", [cmd("esquisse.supprimer", {}, ["A"])])).requestId;
    expect(bus.etatLocal()?.objets.A).toBeUndefined();
    serveur.refuserLibelle = "Tracer A";
    joignabilite.definir("en-ligne");
    await attendre(bus);
    expect(bus.etatDe(a)).toBe("refusee");
    expect(bus.etatDe(b)).toBe("acceptee");
    expect(bus.etatDe(c)).toBe("refusee");
    const refus = evenements.filter((e) => e.nom === "lot-refuse").map((e) => e.valeur as EvenementsBus["lot-refuse"]);
    expect(refus.map((r) => [r.requestId, r.origine, r.http])).toEqual([
      [a, "serveur", 400],
      [c, "revalidation", null],
    ]);
    expect(refus[0]?.erreurs[0]?.cause).toBe("refus forcé");
    // B, parti après le refus de A, a été recalé sur la révision confirmée (même requestId).
    expect(serveur.envois.map((e) => [e.label, e.baseRevision])).toEqual([
      ["Tracer A", 1],
      ["Tracer B", 1],
    ]);
    expect(serveur.envois[1]?.requestId).toBe(b);
    const local = bus.etatLocal()!;
    expect(local.objets.A).toBeUndefined();
    expect(local.objets.B).toBeDefined();
    expect(local.empreinte).toBe(serveur.etat.empreinte);
    expect(await stockage.lister("p")).toHaveLength(0);
  });

  it("conflit 409 : lot « en conflit », file bloquée, données du panneau (serveur / local) ; garder le serveur", async () => {
    const serveur = new ServeurFactice();
    const { bus, joignabilite, evenements } = monter(serveur);
    await bus.ouvrir();
    joignabilite.definir("hors-ligne");
    const r1 = ok(await bus.executer("Renommer le calque", [renommerCalque("Local")])).requestId;
    const r2 = ok(await bus.executer("Tracer A", [ligne("A")])).requestId;
    serveur.autreCompte("Renommage distant", [renommerCalque("Serveur")]);
    joignabilite.definir("en-ligne");
    await attendre(bus);

    expect(bus.etatDe(r1)).toBe("en-conflit");
    expect(bus.etatDe(r2)).toBe("en-attente");
    expect(serveur.envois.map((e) => e.requestId)).toEqual([r1]); // le lot suivant attend la décision
    expect(evenements.some((e) => e.nom === "conflit")).toBe(true);
    expect(evenements.some((e) => e.nom === "revision-distante")).toBe(true);

    const [donnees] = bus.conflits();
    expect(donnees).toMatchObject({ requestId: r1, label: "Renommer le calque", baseRevision: 1, revisionCourante: 2, lotsBloques: 1 });
    expect(donnees?.objets[0]?.objetId).toBe("C1");
    expect(donnees?.objets[0]?.ecarts).toContainEqual({ cle: "nom", serveur: "Serveur", local: "Local" });
    const panneau = sourceConflits(bus);
    expect(panneau.get()).toBe(panneau.get()); // instantané stable
    expect(panneau.get()[0]?.lignes).toContainEqual({ objet: "C1", champ: "nom", serveur: "Serveur", local: "Local" });
    expect(sourceSynchro(bus).get()).toEqual({ enAttente: 1, conflits: 1 });

    const res = await bus.resoudreConflit(r1, "garder-serveur");
    expect(res.ok).toBe(true);
    await attendre(bus);
    expect(bus.etatDe(r1)).toBe("refusee");
    expect(bus.etatLocal()?.objets.C1?.params).toMatchObject({ nom: "Serveur" });
    // Le lot suivant était fondé sur le lot abandonné : il passe en conflit (détecté localement), sans envoi ni recalage silencieux.
    expect(bus.etatDe(r2)).toBe("en-conflit");
    expect(serveur.envois.map((e) => e.requestId)).toEqual([r1]);
    expect(bus.conflits()[0]).toMatchObject({ requestId: r2, lotsBloques: 0 });
    // Décision explicite pour lui aussi : rejoué sur l'état du serveur.
    ok(await bus.resoudreConflit(r2, "rejouer"));
    await attendre(bus);
    expect(bus.etatDe(r2)).toBe("acceptee");
    expect(serveur.etat.objets.A).toBeDefined();
    expect(serveur.etat.objets.C1?.params).toMatchObject({ nom: "Serveur" });
    expect(bus.etatLocal()?.empreinte).toBe(serveur.etat.empreinte);
  });

  it("conflit 409 : rejouer mes commandes → revalidées sur l'état du serveur, renvoyées dans l'ordre", async () => {
    const serveur = new ServeurFactice();
    const { bus, joignabilite } = monter(serveur);
    await bus.ouvrir();
    joignabilite.definir("hors-ligne");
    const r1 = ok(await bus.executer("Renommer le calque", [renommerCalque("Local")])).requestId;
    const r2 = ok(await bus.executer("Tracer A", [ligne("A")])).requestId;
    serveur.autreCompte("Distant", [ligne("Z", 9)]);
    joignabilite.definir("en-ligne");
    await attendre(bus);
    expect(bus.etatDe(r1)).toBe("en-conflit");

    const res = await bus.resoudreConflit(r1, "rejouer");
    const nouveau = ok(res).requestId!;
    expect(nouveau).not.toBe(r1);
    await attendre(bus);
    expect(bus.etatDe(r1)).toBe("acceptee"); // suit le lot rejoué
    expect(bus.etatDe(r2)).toBe("acceptee");
    expect(serveur.envois.map((e) => [e.requestId, e.baseRevision])).toEqual([
      [r1, 1],
      [nouveau, 2],
      [r2, 3],
    ]);
    expect(serveur.etat.objets.C1?.params).toMatchObject({ nom: "Local" });
    expect(Object.keys(serveur.etat.objets)).toEqual(expect.arrayContaining(["A", "Z"]));
    expect(bus.etatLocal()?.empreinte).toBe(serveur.etat.empreinte);
    expect(bus.conflits()).toHaveLength(0);
  });

  it("rejouer refusé par la revalidation : le conflit reste, avec les erreurs", async () => {
    const serveur = new ServeurFactice();
    const { bus, joignabilite } = monter(serveur);
    await bus.ouvrir();
    ok(await bus.executer("Tracer A", [ligne("A")]));
    await attendre(bus);
    joignabilite.definir("hors-ligne");
    const r1 = ok(await bus.executer("Supprimer A", [cmd("esquisse.supprimer", {}, ["A"])])).requestId;
    serveur.autreCompte("Suppression distante", [cmd("esquisse.supprimer", {}, ["A"])]);
    joignabilite.definir("en-ligne");
    await attendre(bus);
    expect(bus.etatDe(r1)).toBe("en-conflit");
    expect(bus.conflits()[0]?.objets[0]).toMatchObject({ objetId: "A", serveur: null, ecarts: [] });
    const res = await bus.resoudreConflit(r1, "rejouer");
    expect(res.ok).toBe(false);
    expect(bus.etatDe(r1)).toBe("en-conflit");
    expect(bus.conflits()[0]?.erreursRevalidation.length).toBeGreaterThan(0);
  });

  it("révision distante : rafraîchir relit le journal et le modèle", async () => {
    const serveur = new ServeurFactice();
    const { bus, evenements } = monter(serveur);
    await bus.ouvrir();
    expect(await bus.rafraichir()).toBe(false);
    serveur.autreCompte("Distant", [ligne("Z")]);
    expect(await bus.rafraichir()).toBe(true);
    const ev = evenements.find((e) => e.nom === "revision-distante")?.valeur as EvenementsBus["revision-distante"];
    expect(ev).toMatchObject({ de: 1, a: 2 });
    expect(ev.entrees.map((e) => e.label)).toEqual(["Distant"]);
    expect(bus.etatLocal()?.objets.Z).toBeDefined();
  });

  it("423 réservation d'autrui : le lot reste en attente (reporté, jamais refusé)", async () => {
    const serveur = new ServeurFactice();
    const envoyer = serveur.transport.envoyerCommandes;
    let reserve = true;
    const { bus, evenements } = monter(
      Object.assign(serveur, {
        transport: { ...serveur.transport, envoyerCommandes: async (p: string, e: Parameters<typeof envoyer>[1]) => (reserve ? { statut: "reserve" as const, http: 423 as const, message: "réservé par B" } : envoyer(p, e)) },
      }),
    );
    await bus.ouvrir();
    const { requestId } = ok(await bus.executer("Tracer A", [ligne("A")]));
    await attendre(bus);
    expect(bus.etatDe(requestId)).toBe("en-attente");
    expect(evenements.find((e) => e.nom === "lot-reporte")?.valeur).toMatchObject({ requestId, http: 423 });
    reserve = false;
    await attendre(bus);
    expect(bus.etatDe(requestId)).toBe("acceptee");
  });
});
