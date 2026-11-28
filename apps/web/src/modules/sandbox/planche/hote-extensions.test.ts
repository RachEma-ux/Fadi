/** Hôte d'une extension (protocole 1.0, lot 1) : espace isolé durable, limites de temps, arrêt et redémarrage. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ajouterRectangle, creerExecutantExtension, modeleVide, v3, validerPaquetExtension, type AccesPlanche, type AdaptateurBooleens, type AdaptateurPlans, type AvisExtension, type DemandeSaisie, type ValeursSaisie, type ExecutantExtension, type Id, type Modele, type PaquetExtension, VERSION_PROTOCOLE } from "@parcours/sandbox-planche-model";
import { creerHoteExtension, type WorkerExtension } from "./hote-extensions";

const lu = validerPaquetExtension(JSON.parse(readFileSync(fileURLToPath(new URL("../../../../e2e/donnees/essai-socle.fadi-addon.json", import.meta.url)), "utf8")));
if (!lu.ok) throw new Error(`extension d'essai refusée : ${lu.detail}`);
const ESSAI: PaquetExtension = lu.paquet;
const lu2 = validerPaquetExtension(JSON.parse(readFileSync(fileURLToPath(new URL("../../../../e2e/donnees/essai-modele.fadi-addon.json", import.meta.url)), "utf8")));
if (!lu2.ok) throw new Error(`extension d'essai du lot 2 refusée : ${lu2.detail}`);
const ESSAI_MODELE: PaquetExtension = lu2.paquet;
const lu3 = validerPaquetExtension(JSON.parse(readFileSync(fileURLToPath(new URL("../../../../e2e/donnees/essai-commandes.fadi-addon.json", import.meta.url)), "utf8")));
if (!lu3.ok) throw new Error(`extension d'essai du lot 3 refusée : ${lu3.detail}`);
const ESSAI_COMMANDES: PaquetExtension = lu3.paquet;
/** Même extension d'essai, avec un autre code (essais des refus). */
const avecCode = (code: string, permissions = ESSAI_COMMANDES.fiche.permissions): PaquetExtension => ({ ...ESSAI_COMMANDES, fiche: { ...ESSAI_COMMANDES.fiche, permissions }, code });
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fenêtre de saisie de remplacement : retient les demandes, la recette répond ou laisse l'hôte la fermer. */
function saisieFausse() {
  const ouvertes: { demande: DemandeSaisie; repondre: (v: ValeursSaisie | null) => void; fermee: boolean }[] = [];
  const saisir = (demande: DemandeSaisie) => {
    let repondre: (v: ValeursSaisie | null) => void = () => {};
    const reponse = new Promise<ValeursSaisie | null>((r) => (repondre = r));
    const x = { demande, repondre, fermee: false };
    ouvertes.push(x);
    return { reponse, fermer: () => void (x.fermee = true) };
  };
  /** Attend la prochaine fenêtre (une de plus qu'à l'appel). */
  const attendre = async () => {
    const avant = ouvertes.length;
    for (let i = 0; i < 200 && ouvertes.length === avant; i++) await pause(2);
    return ouvertes[ouvertes.length - 1]!;
  };
  return { ouvertes, saisir, attendre };
}

/** Planche de remplacement : un modèle, une sélection, et les pas d'annulation appliqués. */
function plancheFausse() {
  const etat = { modele: modeleVide() as Modele, selection: [] as Id[], pas: [] as string[] };
  const acces: AccesPlanche = {
    modele: () => etat.modele,
    selection: () => etat.selection,
    dans: () => undefined,
    appliquer: (travail, nom) => {
      etat.modele = travail;
      etat.pas.push(nom);
      return true;
    },
    selectionner: (ids) => void (etat.selection = [...ids]),
  };
  return { etat, acces };
}

/**
 * Worker de remplacement : le vrai exécutant, dans le même fil, avec des messages différés comme entre deux fils.
 * `muet` nomme les appels qui ne répondent jamais (une boucle sans fin ne peut pas tourner dans le fil des tests).
 */
function faux(o: { muet?: readonly string[]; journal: string[] } = { journal: [] }) {
  const crees: { termine: boolean }[] = [];
  const creer = (): WorkerExtension => {
    const etat = { termine: false };
    crees.push(etat);
    let x: ExecutantExtension | null = null;
    const w: WorkerExtension = {
      onmessage: null,
      onerror: null,
      terminate: () => void (etat.termine = true),
      postMessage: (m) => {
        const brut = JSON.parse(JSON.stringify(m)) as { demarrer?: { fiche: { id: string; version: string }; code: string }; nom?: string };
        setTimeout(() => {
          if (etat.termine) return;
          const rendre = (r: unknown) => setTimeout(() => !etat.termine && w.onmessage?.({ data: JSON.parse(JSON.stringify(r)) }), 0);
          if (brut.demarrer) {
            x = creerExecutantExtension(brut.demarrer, rendre);
            const erreur = x.demarrer();
            rendre({ demarre: erreur === null, erreur });
            return;
          }
          if (brut.nom && o.muet?.includes(brut.nom)) return;
          x?.recevoir(brut);
        }, 0);
      },
    };
    return w;
  };
  return { creer, crees };
}

describe("hôte d'une extension — l'extension d'essai du socle", () => {
  it("démarre au premier appel seulement, reste en vie et garde son état d'un appel à l'autre", async () => {
    const journal: string[] = [];
    const f = faux();
    const h = creerHoteExtension(ESSAI, { creer: f.creer, surJournal: (l) => journal.push(l) });
    expect(h.enMarche()).toBe(false);
    expect(f.crees).toHaveLength(0);
    expect(await h.appeler("demande", "commande.compter")).toEqual({ genre: "fini", resultat: { appels: 1, selection: 0 } });
    expect(await h.appeler("evenement", "selection.change", ["a", "b", "c"])).toEqual({ genre: "fini", resultat: null });
    expect(await h.appeler("demande", "commande.compter")).toEqual({ genre: "fini", resultat: { appels: 2, selection: 3 } });
    expect(f.crees).toHaveLength(1);
    expect(h.enMarche()).toBe(true);
    expect(journal).toEqual(["prête", "appel 1", "appel 2"]);
  });

  it("les appels passent un par un, dans l'ordre demandé", async () => {
    const f = faux();
    const h = creerHoteExtension(ESSAI, { creer: f.creer });
    const issues = await Promise.all([h.appeler("demande", "commande.compter"), h.appeler("demande", "commande.compter"), h.appeler("demande", "commande.compter")]);
    expect(issues.map((i) => (i.genre === "fini" ? (i.resultat as { appels: number }).appels : i.genre))).toEqual([1, 2, 3]);
    expect(f.crees).toHaveLength(1);
  });

  it("délai dépassé : l'espace isolé est arrêté, l'appel rend « delai », et l'extension redémarre à neuf au prochain appel", async () => {
    const f = faux({ muet: ["commande.boucler"], journal: [] });
    const h = creerHoteExtension(ESSAI, { creer: f.creer, delaiCommandeMs: 40, delaiEvenementMs: 20 });
    expect(await h.appeler("demande", "commande.compter")).toMatchObject({ genre: "fini", resultat: { appels: 1 } });
    expect(await h.appeler("demande", "commande.boucler")).toEqual({ genre: "delai" });
    expect(f.crees[0]!.termine).toBe(true);
    expect(h.enMarche()).toBe(false);
    expect(await h.appeler("demande", "commande.compter")).toMatchObject({ genre: "fini", resultat: { appels: 1 } });
    expect(f.crees).toHaveLength(2);
  });

  it("un événement a sa propre limite, plus courte que celle d'une commande", async () => {
    const f = faux({ muet: ["selection.change"], journal: [] });
    const h = creerHoteExtension(ESSAI, { creer: f.creer, delaiCommandeMs: 5000, delaiEvenementMs: 20 });
    const debut = Date.now();
    expect(await h.appeler("evenement", "selection.change", [])).toEqual({ genre: "delai" });
    expect(Date.now() - debut).toBeLessThan(1000);
  });

  it("demande sans traitement : erreur nommée du protocole, l'extension reste en marche", async () => {
    const f = faux();
    const h = creerHoteExtension(ESSAI, { creer: f.creer });
    expect(await h.appeler("demande", "commande.absente")).toEqual({ genre: "erreur", nom: "demande_inconnue", detail: "commande.absente" });
    expect(h.enMarche()).toBe(true);
  });

  it("arrêt à la demande pendant un appel : l'appel rend « arrete »", async () => {
    const f = faux({ muet: ["commande.boucler"], journal: [] });
    const h = creerHoteExtension(ESSAI, { creer: f.creer });
    await h.appeler("demande", "commande.compter");
    const enCours = h.appeler("demande", "commande.boucler");
    await new Promise((r) => setTimeout(r, 5));
    h.arreter();
    expect(await enCours).toEqual({ genre: "arrete" });
    expect(f.crees[0]!.termine).toBe(true);
  });

  it("arrêt à la demande : les appels qui attendaient rendent « arrete » sans relancer l'extension ; un appel fait ensuite la relance", async () => {
    const f = faux({ muet: ["commande.boucler"], journal: [] });
    const h = creerHoteExtension(ESSAI, { creer: f.creer });
    const premier = h.appeler("demande", "commande.boucler");
    const second = h.appeler("demande", "commande.compter");
    await new Promise((r) => setTimeout(r, 5));
    h.arreter();
    expect(await premier).toEqual({ genre: "arrete" });
    expect(await second).toEqual({ genre: "arrete" });
    expect(h.enMarche()).toBe(false);
    expect(f.crees).toHaveLength(1);
    expect(await h.appeler("demande", "commande.compter")).toMatchObject({ genre: "fini" });
    expect(f.crees).toHaveLength(2);
  });

  it("démarrage manqué : le motif est rendu et l'espace isolé est arrêté", async () => {
    const f = faux();
    const h = creerHoteExtension({ ...ESSAI, code: 'const m = import("ailleurs");' }, { creer: f.creer });
    expect(await h.appeler("demande", "commande.compter")).toEqual({ genre: "demarrage", erreur: { genre: "import" } });
    expect(h.enMarche()).toBe(false);
    expect(f.crees[0]!.termine).toBe(true);
  });

  it("espace isolé impossible à créer, ou réponse illisible : « panne », jamais d'exception", async () => {
    const h = creerHoteExtension(ESSAI, {
      creer: () => {
        throw new Error("pas de Worker");
      },
    });
    expect(await h.appeler("demande", "commande.compter")).toEqual({ genre: "panne" });
  });

  it("une demande de l'extension hors de la table du protocole est refusée par son nom", async () => {
    const recus: unknown[] = [];
    const creer = (): WorkerExtension => {
      const w: WorkerExtension = {
        onmessage: null,
        onerror: null,
        terminate: () => {},
        postMessage: (m) => {
          const brut = JSON.parse(JSON.stringify(m)) as { demarrer?: unknown; sorte?: string; id?: number };
          setTimeout(() => {
            if (brut.demarrer) return w.onmessage?.({ data: { demarre: true, erreur: null } });
            if (brut.sorte === "reponse") return void recus.push(brut);
            // L'extension tente d'appeler le serveur avant de répondre : la Planche refuse, puis reçoit la réponse.
            w.onmessage?.({ data: { protocole: "1.0", sorte: "demande", id: 7, nom: "serveur.appeler", donnees: null } });
            w.onmessage?.({ data: { protocole: "1.0", sorte: "reponse", id: brut.id, ok: true, resultat: "fait" } });
          }, 0);
        },
      };
      return w;
    };
    const h = creerHoteExtension(ESSAI, { creer });
    expect(await h.appeler("demande", "commande.compter")).toEqual({ genre: "fini", resultat: "fait" });
    await new Promise((r) => setTimeout(r, 5));
    expect(recus).toEqual([{ protocole: VERSION_PROTOCOLE, sorte: "reponse", id: 7, ok: false, resultat: null, erreur: { nom: "demande_inconnue", detail: "serveur.appeler" } }]);
  });
});

describe("hôte d'une extension — lot 2 : modèle, opération, sélection", () => {
  it("opération explicite : la boîte est posée en un seul pas d'annulation, groupée et sélectionnée", async () => {
    const p = plancheFausse();
    const h = creerHoteExtension(ESSAI_MODELE, { creer: faux().creer, acces: p.acces });
    const r = await h.appeler("demande", "commande.poser-boite");
    expect(r).toMatchObject({ genre: "fini", resultat: { crees: 1 } });
    expect(p.etat.pas).toEqual(["Poser une boîte"]);
    const objets = Object.keys(p.etat.modele.racine.occurrences);
    expect(objets).toHaveLength(1);
    expect(p.etat.selection).toEqual(objets);
    expect(await h.appeler("demande", "commande.compter")).toEqual({ genre: "fini", resultat: { faces: 0, aretes: 0, objets: 1, selection: 1 } });
  });

  it("modification sans opération : une opération automatique au nom de la commande, validée à la fin", async () => {
    const p = plancheFausse();
    const h = creerHoteExtension(ESSAI_MODELE, { creer: faux().creer, acces: p.acces });
    expect(await h.appeler("demande", "commande.sans-operation")).toEqual({ genre: "fini", resultat: "fait" });
    expect(p.etat.pas).toEqual(["commande.sans-operation"]);
    expect(Object.keys(p.etat.modele.racine.faces)).toHaveLength(1);
  });

  it("seconde opération : l'extension reçoit l'erreur par son nom ; commande en échec ou arrêtée au délai : rien n'est appliqué", async () => {
    const p = plancheFausse();
    const h = creerHoteExtension(ESSAI_MODELE, { creer: faux({ muet: ["commande.trainer"], journal: [] }).creer, acces: p.acces, delaiCommandeMs: 40 });
    expect(await h.appeler("demande", "commande.deux-operations")).toEqual({ genre: "fini", resultat: "operation_deja_ouverte" });
    expect(await h.appeler("demande", "commande.echouer")).toMatchObject({ genre: "erreur", nom: "echec_extension" });
    expect(await h.appeler("demande", "commande.trainer")).toEqual({ genre: "delai" });
    expect(p.etat.pas).toEqual([]);
    expect(Object.keys(p.etat.modele.racine.aretes)).toHaveLength(0);
    // L'extension repart à neuf et sert de nouveau.
    expect(await h.appeler("demande", "commande.sans-operation")).toEqual({ genre: "fini", resultat: "fait" });
  });

  it("dessin changé pendant une commande sans opération : la commande rend « operation_refusee », rien n'est appliqué", async () => {
    const p = plancheFausse();
    const f = faux();
    // L'utilisateur dessine juste après que l'extension a ouvert son opération (première lecture du modèle par l'hôte).
    const autre = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(2, 0, 0), v3(0, 2, 0)).modele;
    let lectures = 0;
    const acces: AccesPlanche = {
      ...p.acces,
      modele: () => {
        const m = p.etat.modele;
        if (++lectures === 1) queueMicrotask(() => void (p.etat.modele = autre));
        return m;
      },
    };
    const h = creerHoteExtension(ESSAI_MODELE, { creer: f.creer, acces });
    const enCours = h.appeler("demande", "commande.sans-operation");
    expect(await enCours).toMatchObject({ genre: "erreur", nom: "operation_refusee" });
    expect(p.etat.modele).toBe(autre);
    expect(p.etat.pas).toEqual([]);
  });

  it("sans accès à la Planche, ou sans la permission : la demande est refusée par son nom", async () => {
    const sansAcces = creerHoteExtension(ESSAI_MODELE, { creer: faux().creer });
    expect(await sansAcces.appeler("demande", "commande.compter")).toMatchObject({ genre: "erreur", nom: "echec_extension", detail: expect.stringContaining("demande_inconnue") as unknown });
    const p = plancheFausse();
    const sansPermission = creerHoteExtension({ ...ESSAI_MODELE, fiche: { ...ESSAI_MODELE.fiche, permissions: ["modele.lire"] } }, { creer: faux().creer, acces: p.acces });
    expect(await sansPermission.appeler("demande", "commande.sans-operation")).toMatchObject({ genre: "erreur", nom: "echec_extension", detail: expect.stringContaining("permission_refusee") as unknown });
    expect(p.etat.pas).toEqual([]);
  });
});


describe("hôte d'une extension — protocole 1.4 : moteur des opérations planes chargé à la demande", () => {
  it("geometrie.union attend le chargement du moteur (hors délai de l'appel), une seule fois, puis répond", async () => {
    const p = plancheFausse();
    let moteur: AdaptateurBooleens | null = null;
    let chargements = 0;
    const plans: AdaptateurPlans = { coupe: () => [], projection: () => [], union: (ps) => [...ps] };
    const chargerGeometrie = async () => {
      chargements++;
      await pause(120);
      moteur = { union: (a) => a, difference: (a) => a, intersection: (a) => a, plans };
    };
    const code = 'planche.sur("commande.union", async () => (await planche.geometrie.union([{ exterieur: [[0, 0], [2, 0], [2, 3], [0, 3]] }])).aire);';
    const h = creerHoteExtension(avecCode(code, ["modele.lire"]), { creer: faux().creer, delaiCommandeMs: 80, acces: { ...p.acces, booleens: () => moteur }, chargerGeometrie: () => (moteur ? Promise.resolve() : chargerGeometrie()) });
    expect(await h.appeler("demande", "commande.union")).toEqual({ genre: "fini", resultat: 6 });
    expect(await h.appeler("demande", "commande.union")).toEqual({ genre: "fini", resultat: 6 });
    expect(chargements).toBe(1);
  });
});

describe("hôte d'une extension — lot 3 : commandes, avis, saisie", () => {
  it("une commande reçoit la langue, dessine dans une opération et pose un avis ; le libellé nomme l'opération automatique", async () => {
    const p = plancheFausse();
    const avis: AvisExtension[] = [];
    const h = creerHoteExtension(ESSAI_COMMANDES, { creer: faux().creer, acces: p.acces, surAvis: (a) => avis.push(a) });
    expect((await h.appeler("demande", "commande.poser-boite", { langue: "en" })).genre).toBe("fini");
    expect(p.etat.pas).toEqual(["Poser une boîte"]);
    expect(avis).toEqual([{ texte: "Box placed.", genre: "info" }]);
    expect(await h.appeler("demande", "commande.compter", { langue: "fr" })).toMatchObject({ genre: "fini", resultat: { objets: 1 } });
    expect(avis[1]!.texte).toMatch(/1 objet\(s\)\.$/);
    // Opération automatique : nommée par le libellé donné à l'appel, pas par le nom technique de la demande.
    const q = plancheFausse();
    const g = creerHoteExtension(avecCode('planche.sur("commande.trait", async () => { await planche.modele.ligne([0, 0, 0], [1, 0, 0]); });'), { creer: faux().creer, acces: q.acces });
    expect((await g.appeler("demande", "commande.trait", null, "Essai : Tracer")).genre).toBe("fini");
    expect(q.etat.pas).toEqual(["Essai : Tracer"]);
  });

  it("saisie : l'extension reçoit les valeurs, ou « rien » si la fenêtre est annulée", async () => {
    const p = plancheFausse();
    const s = saisieFausse();
    const avis: AvisExtension[] = [];
    const h = creerHoteExtension(ESSAI_COMMANDES, { creer: faux().creer, acces: p.acces, surAvis: (a) => avis.push(a), saisir: s.saisir });
    const appel = h.appeler("demande", "commande.boite-sur-mesure", { langue: "fr" });
    const fenetre = await s.attendre();
    expect(fenetre.demande.titre).toBe("Dimensions de la boîte");
    expect(fenetre.demande.champs.map((c) => `${c.id}:${c.genre}`)).toEqual(["nom:texte", "largeur:nombre", "profondeur:nombre", "hauteur:nombre", "forme:choix", "grouper:case"]);
    fenetre.repondre({ nom: "Socle", largeur: 2.5, profondeur: 1, hauteur: 0.5, forme: "pleine", grouper: true });
    expect(await appel).toMatchObject({ genre: "fini", resultat: { nom: "Socle", largeur: 2.5 } });
    expect(p.etat.pas).toHaveLength(1);
    expect(p.etat.selection).toHaveLength(1);
    expect(avis.at(-1)).toEqual({ texte: "Boîte dessinée : 2.5 × 1 × 0.5 m", genre: "info" });

    const annulee = h.appeler("demande", "commande.boite-sur-mesure", { langue: "fr" });
    (await s.attendre()).repondre(null);
    expect(await annulee).toEqual({ genre: "fini", resultat: null });
    expect(p.etat.pas).toHaveLength(1);
    expect(avis.at(-1)).toEqual({ texte: "Saisie annulée : rien n'a été dessiné.", genre: "alerte" });
  });

  it("le délai de la commande ne court pas pendant la saisie ; il reprend ensuite, avec ce qu'il restait", async () => {
    const s = saisieFausse();
    const code = 'planche.sur("commande.demander", async () => { const v = await planche.saisie.demander("T", [{ id: "a", libelle: "A", genre: "case" }]); return v; });\nplanche.sur("commande.puis-trainer", async () => { await planche.saisie.demander("T", [{ id: "a", libelle: "A", genre: "case" }]); await new Promise(() => {}); });';
    const h = creerHoteExtension(avecCode(code), { creer: faux().creer, delaiCommandeMs: 60, saisir: s.saisir });
    const appel = h.appeler("demande", "commande.demander");
    const fenetre = await s.attendre();
    await pause(150);
    expect(h.enMarche()).toBe(true);
    fenetre.repondre({ a: true });
    expect(await appel).toEqual({ genre: "fini", resultat: { a: true } });
    // Après la réponse, l'extension qui ne rend plus la main est arrêtée au délai, comme toute commande.
    const lente = h.appeler("demande", "commande.puis-trainer");
    (await s.attendre()).repondre({ a: false });
    expect(await lente).toEqual({ genre: "delai" });
    expect(h.enMarche()).toBe(false);
  });

  it("l'arrêt pendant une saisie referme la fenêtre ; une réponse tardive n'atteint plus personne", async () => {
    const s = saisieFausse();
    const h = creerHoteExtension(ESSAI_COMMANDES, { creer: faux().creer, acces: plancheFausse().acces, surAvis: () => {}, saisir: s.saisir });
    const appel = h.appeler("demande", "commande.boite-sur-mesure", { langue: "fr" });
    const fenetre = await s.attendre();
    h.arreter();
    expect(await appel).toEqual({ genre: "arrete" });
    expect(fenetre.fermee).toBe(true);
    fenetre.repondre({ nom: "x", largeur: 1, profondeur: 1, hauteur: 1, forme: "pleine", grouper: false });
    await pause(10);
    expect(h.enMarche()).toBe(false);
  });

  it("refus nommés : sans la permission « messages », forme invalide, seconde fenêtre, saisie dans un événement, avis bornés", async () => {
    const s = saisieFausse();
    const avis: AvisExtension[] = [];
    const nom = 'async (f) => { try { await f(); return "aucune erreur"; } catch (e) { return e.name + " : " + e.message; } }';
    const code = `const essayer = ${nom};
planche.sur("commande.avis-vide", () => essayer(() => planche.message.afficher("")));
planche.sur("commande.saisie-vide", () => essayer(() => planche.saisie.demander("T", [])));
planche.sur("commande.deux", () => essayer(async () => { planche.saisie.demander("T", [{ id: "a", libelle: "A", genre: "case" }]); await planche.saisie.demander("U", [{ id: "b", libelle: "B", genre: "case" }]); }));
planche.sur("modele.change", () => essayer(() => planche.saisie.demander("T", [{ id: "a", libelle: "A", genre: "case" }])).then((r) => planche.afficher(r)));
planche.sur("commande.bavarde", async () => { for (let i = 0; i < 9; i++) await planche.message.afficher("avis " + i); return "fait"; });`;
    const journal: string[] = [];
    const h = creerHoteExtension(avecCode(code), { creer: faux().creer, surAvis: (a) => avis.push(a), saisir: s.saisir, surJournal: (l) => journal.push(l) });
    expect(await h.appeler("demande", "commande.avis-vide")).toMatchObject({ genre: "fini", resultat: expect.stringMatching(/^argument_invalide : avis/) });
    expect(await h.appeler("demande", "commande.saisie-vide")).toMatchObject({ genre: "fini", resultat: expect.stringMatching(/^argument_invalide : saisie : de 1 à 12 champs/) });
    const deux = h.appeler("demande", "commande.deux");
    expect(await deux).toMatchObject({ genre: "fini", resultat: "argument_invalide : saisie : une fenêtre est déjà ouverte" });
    // La fin de la commande referme la fenêtre restée ouverte.
    expect(s.ouvertes).toHaveLength(1);
    expect(s.ouvertes[0]!.fermee).toBe(true);
    expect((await h.appeler("evenement", "modele.change")).genre).toBe("fini");
    expect(journal).toEqual(["argument_invalide : saisie : pendant une commande seulement"]);
    expect(await h.appeler("demande", "commande.bavarde")).toEqual({ genre: "fini", resultat: "fait" });
    expect(avis.map((a) => a.texte)).toEqual(["avis 0", "avis 1", "avis 2", "avis 3", "avis 4"]);

    const sans = creerHoteExtension(avecCode(code, ["modele.lire"]), { creer: faux().creer, surAvis: (a) => avis.push(a), saisir: s.saisir });
    expect(await sans.appeler("demande", "commande.avis-vide")).toMatchObject({ genre: "fini", resultat: "permission_refusee : messages" });
    // Planche sans affichage branché (aucun `surAvis`) : la demande n'existe pas pour l'extension.
    const nue = creerHoteExtension(avecCode(code), { creer: faux().creer });
    expect(await nue.appeler("demande", "commande.avis-vide")).toMatchObject({ genre: "fini", resultat: "demande_inconnue : message.afficher" });
  });
});

describe("événements et minuteries (lot 7)", () => {
  /** Planche de remplacement qui retient le contexte de chaque application (discrète ou non, marque). */
  function plancheSuivie() {
    const etat = { modele: modeleVide() as Modele, applications: [] as { nom: string; discrete: boolean; marque: unknown }[] };
    const acces: AccesPlanche = {
      modele: () => etat.modele,
      selection: () => [],
      dans: () => undefined,
      appliquer: (travail, nom, _crees, contexte) => {
        etat.modele = travail;
        etat.applications.push({ nom, discrete: contexte?.discrete === true, marque: contexte?.marque });
        return true;
      },
      selectionner: () => {},
    };
    return { etat, acces };
  }
  const PERMISSIONS = ["modele.lire", "modele.modifier", "evenements"] as const;
  const attendreQue = async (f: () => boolean) => {
    for (let i = 0; i < 300 && !f(); i++) await pause(2);
  };

  it("une réaction à un événement modifie le dessin dans une opération discrète, avec la marque de l'appel", async () => {
    const p = plancheSuivie();
    const code = 'planche.sur("modele.change", async () => { await planche.modele.ligne([0, 0, 0], [1, 0, 0]); });\nplanche.sur("commande.tracer", async () => { await planche.modele.ligne([0, 0, 0], [0, 1, 0]); });';
    const h = creerHoteExtension(avecCode(code, [...PERMISSIONS]), { creer: faux().creer, acces: p.acces });
    expect((await h.appeler("demande", "commande.tracer", null, "Tracer")).genre).toBe("fini");
    expect((await h.appeler("evenement", "modele.change", null, "Réaction", { rebond: 2 })).genre).toBe("fini");
    expect(p.etat.applications).toEqual([
      { nom: "Tracer", discrete: false, marque: undefined },
      { nom: "Réaction", discrete: true, marque: { rebond: 2 } },
    ]);
  });

  it("une minuterie appelle sa fonction une fois, après la commande ; elle garde la marque et fait son propre pas", async () => {
    const p = plancheSuivie();
    const journal: string[] = [];
    const echeances: string[] = [];
    const code = 'planche.sur("commande.differer", async () => { const id = await planche.minuterie.dans(20, async () => { planche.afficher("échéance"); await planche.modele.ligne([0, 0, 0], [1, 1, 0]); }); planche.afficher("armée " + id); return id; });';
    const h = creerHoteExtension(avecCode(code, [...PERMISSIONS]), { creer: faux().creer, acces: p.acces, surJournal: (l) => journal.push(l), surEcheance: (i) => echeances.push(i.genre), libelleEcheance: "Action différée" });
    expect(await h.appeler("demande", "commande.differer", null, "Différer", { rebond: 1 })).toEqual({ genre: "fini", resultat: 1 });
    expect(journal).toEqual(["armée 1"]);
    await attendreQue(() => echeances.length > 0);
    expect(echeances).toEqual(["fini"]);
    expect(journal).toEqual(["armée 1", "échéance"]);
    expect(p.etat.applications).toEqual([{ nom: "Action différée", discrete: false, marque: { rebond: 1 } }]);
    await pause(40);
    expect(echeances).toHaveLength(1);
  });

  it("une minuterie annulée ou perdue à l'arrêt ne sonne pas", async () => {
    const echeances: string[] = [];
    const journal: string[] = [];
    const code = 'planche.sur("commande.armer-puis-annuler", async () => { const id = await planche.minuterie.dans(15, () => planche.afficher("ne doit pas sonner")); await planche.minuterie.annuler(id); return id; });\nplanche.sur("commande.armer", () => planche.minuterie.dans(15, () => planche.afficher("ne doit pas sonner")));';
    const h = creerHoteExtension(avecCode(code, [...PERMISSIONS]), { creer: faux().creer, surJournal: (l) => journal.push(l), surEcheance: (i) => echeances.push(i.genre) });
    expect((await h.appeler("demande", "commande.armer-puis-annuler")).genre).toBe("fini");
    expect((await h.appeler("demande", "commande.armer")).genre).toBe("fini");
    h.arreter();
    await pause(60);
    expect(echeances).toEqual([]);
    expect(journal).toEqual([]);
    expect(h.enMarche()).toBe(false);
  });

  it("refus nommés : sans la permission « evenements », délai hors bornes, onze minuteries", async () => {
    const nom = 'async (f) => { try { await f(); return "aucune erreur"; } catch (e) { return e.name + " : " + e.message; } }';
    const code = `const essayer = ${nom};
planche.sur("commande.armer", () => essayer(() => planche.minuterie.dans(10000, () => {})));
planche.sur("commande.trop-long", () => essayer(() => planche.minuterie.dans(600001, () => {})));
planche.sur("commande.negatif", () => essayer(() => planche.minuterie.dans(-1, () => {})));
planche.sur("commande.onze", () => essayer(async () => { for (let i = 0; i < 11; i++) await planche.minuterie.dans(10000, () => {}); }));`;
    const h = creerHoteExtension(avecCode(code, [...PERMISSIONS]), { creer: faux().creer });
    expect(await h.appeler("demande", "commande.trop-long")).toMatchObject({ genre: "fini", resultat: expect.stringMatching(/^argument_invalide : delaiMs/) });
    expect(await h.appeler("demande", "commande.negatif")).toMatchObject({ genre: "fini", resultat: expect.stringMatching(/^argument_invalide : delaiMs/) });
    expect(await h.appeler("demande", "commande.onze")).toMatchObject({ genre: "fini", resultat: "argument_invalide : 10 minuteries au plus à la fois" });
    h.arreter();
    const sans = creerHoteExtension(avecCode(code, ["modele.lire"]), { creer: faux().creer });
    expect(await sans.appeler("demande", "commande.armer")).toMatchObject({ genre: "fini", resultat: "permission_refusee : evenements" });
    sans.arreter();
  });

  it("l'extension d'essai du lot 7 est admise ; elle compte les changements et lit les unités", async () => {
    const lu7 = validerPaquetExtension(JSON.parse(readFileSync(fileURLToPath(new URL("../../../../e2e/donnees/essai-evenements.fadi-addon.json", import.meta.url)), "utf8")));
    if (!lu7.ok) throw new Error(`extension d'essai du lot 7 refusée : ${lu7.detail}`);
    expect(lu7.paquet.fiche.abonnements).toEqual(["projet.ouvert", "projet.enregistre", "modele.change", "selection.change"]);
    const p = plancheSuivie();
    const avis: AvisExtension[] = [];
    const h = creerHoteExtension(lu7.paquet, { creer: faux().creer, acces: { ...p.acces, separateur: () => "." }, surAvis: (a) => avis.push(a) });
    expect((await h.appeler("evenement", "modele.change", { ajoutes: [], modifies: [], supprimes: [], origine: "utilisateur", tronque: false }, "Réaction")).genre).toBe("fini");
    expect(p.etat.applications).toEqual([{ nom: "Réaction", discrete: true, marque: undefined }]);
    expect(await h.appeler("demande", "commande.etat")).toMatchObject({ genre: "fini", resultat: { changements: 1, origines: ["utilisateur"] } });
    expect(await h.appeler("demande", "commande.mesurer")).toMatchObject({ genre: "fini", resultat: { unites: { longueur: "m", separateur: "." }, matieres: 0, balises: 0 } });
    expect(avis.at(-1)?.texte).toBe("1.50 m · 2.25 m² · 0 matière(s) · 0 balise(s)");
    h.arreter();
  });

  it("une échéance qui ne rend pas la main est arrêtée au délai d'un événement", async () => {
    const echeances: string[] = [];
    const code = 'planche.sur("commande.armer", () => planche.minuterie.dans(5, () => new Promise(() => {})));';
    const h = creerHoteExtension(avecCode(code, [...PERMISSIONS]), { creer: faux().creer, delaiEvenementMs: 40, surEcheance: (i) => echeances.push(i.genre) });
    expect((await h.appeler("demande", "commande.armer")).genre).toBe("fini");
    await attendreQue(() => echeances.length > 0);
    expect(echeances).toEqual(["delai"]);
    expect(h.enMarche()).toBe(false);
  });
});

describe("fichiers (lot 7)", () => {
  /** Fenêtres de remplacement : retiennent les demandes, la recette répond ou laisse l'hôte fermer. */
  function fichiersFaux() {
    const ouvertes: { sorte: "ouvrir" | "enregistrer"; demande: unknown; repondre: (v: unknown) => void; fermee: boolean }[] = [];
    const fenetre = (sorte: "ouvrir" | "enregistrer") => (demande: unknown) => {
      let repondre: (v: unknown) => void = () => {};
      const reponse = new Promise<unknown>((r) => (repondre = r));
      const x = { sorte, demande, repondre, fermee: false };
      ouvertes.push(x);
      return { reponse: reponse as Promise<never>, fermer: () => void (x.fermee = true) };
    };
    const attendre = async () => {
      const avant = ouvertes.length;
      for (let i = 0; i < 200 && ouvertes.length === avant; i++) await pause(2);
      return ouvertes[ouvertes.length - 1]!;
    };
    return { ouvertes, attendre, fichiers: { ouvrir: fenetre("ouvrir"), enregistrer: fenetre("enregistrer") } };
  }
  const nom = 'async (f) => { try { return await f(); } catch (e) { return e.name + " : " + e.message; } }';
  const code = `const essayer = ${nom};
planche.sur("commande.ouvrir", () => essayer(() => planche.fichiers.ouvrir([".csv"])));
planche.sur("commande.enregistrer", () => essayer(() => planche.fichiers.enregistrer("liste.csv", "a;b")));
planche.sur("commande.chemin", () => essayer(() => planche.fichiers.enregistrer("../liste.csv", "a;b")));
planche.sur("commande.page", () => essayer(() => planche.fichiers.ouvrir([".html"])));
planche.sur("modele.change", () => essayer(() => planche.fichiers.ouvrir()).then((r) => planche.afficher(r)));`;
  const PERMISSIONS = ["modele.lire", "fichiers"] as const;

  it("ouvrir : l'extension reçoit le seul fichier choisi, relu ; le délai ne court pas pendant le choix", async () => {
    const f = fichiersFaux();
    const h = creerHoteExtension(avecCode(code, [...PERMISSIONS]), { creer: faux().creer, delaiCommandeMs: 60, fichiers: f.fichiers });
    const appel = h.appeler("demande", "commande.ouvrir");
    const fenetre = await f.attendre();
    expect(fenetre).toMatchObject({ sorte: "ouvrir", demande: { types: [".csv"] } });
    await pause(150);
    expect(h.enMarche()).toBe(true);
    fenetre.repondre({ nom: "/home/moi/liste.csv", texte: "a;b\n1;2" });
    expect(await appel).toEqual({ genre: "fini", resultat: { nom: "liste.csv", texte: "a;b\n1;2" } });

    const renonce = h.appeler("demande", "commande.ouvrir");
    (await f.attendre()).repondre(null);
    expect(await renonce).toEqual({ genre: "fini", resultat: null });

    const autreType = h.appeler("demande", "commande.ouvrir");
    (await f.attendre()).repondre({ nom: "notes.txt", texte: "x" });
    expect(await autreType).toMatchObject({ genre: "fini", resultat: expect.stringMatching(/^argument_invalide : fichier d'un autre type/) });
    h.arreter();
  });

  it("enregistrer : vrai si l'utilisateur accepte, faux s'il renonce ; l'arrêt referme la fenêtre", async () => {
    const f = fichiersFaux();
    const h = creerHoteExtension(avecCode(code, [...PERMISSIONS]), { creer: faux().creer, fichiers: f.fichiers });
    const accepte = h.appeler("demande", "commande.enregistrer");
    const fenetre = await f.attendre();
    expect(fenetre).toMatchObject({ sorte: "enregistrer", demande: { nom: "liste.csv", texte: "a;b" } });
    fenetre.repondre(true);
    expect(await accepte).toEqual({ genre: "fini", resultat: true });
    const refuse = h.appeler("demande", "commande.enregistrer");
    (await f.attendre()).repondre(false);
    expect(await refuse).toEqual({ genre: "fini", resultat: false });
    const arrete = h.appeler("demande", "commande.enregistrer");
    const derniere = await f.attendre();
    h.arreter();
    expect(await arrete).toEqual({ genre: "arrete" });
    expect(derniere.fermee).toBe(true);
  });

  it("refus nommés : sans la permission, chemin, type étranger, hors d'une commande, Planche sans fenêtre", async () => {
    const f = fichiersFaux();
    const journal: string[] = [];
    const h = creerHoteExtension(avecCode(code, [...PERMISSIONS]), { creer: faux().creer, fichiers: f.fichiers, surJournal: (l) => journal.push(l) });
    expect(await h.appeler("demande", "commande.chemin")).toMatchObject({ genre: "fini", resultat: expect.stringMatching(/^argument_invalide : nom : nom de fichier simple/) });
    expect(await h.appeler("demande", "commande.page")).toMatchObject({ genre: "fini", resultat: expect.stringMatching(/^argument_invalide : types/) });
    expect((await h.appeler("evenement", "modele.change")).genre).toBe("fini");
    expect(journal).toEqual(["argument_invalide : fichiers : pendant une commande seulement"]);
    expect(f.ouvertes).toHaveLength(0);
    h.arreter();
    const sans = creerHoteExtension(avecCode(code, ["modele.lire"]), { creer: faux().creer, fichiers: f.fichiers });
    expect(await sans.appeler("demande", "commande.ouvrir")).toMatchObject({ genre: "fini", resultat: "permission_refusee : fichiers" });
    sans.arreter();
    const nue = creerHoteExtension(avecCode(code, [...PERMISSIONS]), { creer: faux().creer });
    expect(await nue.appeler("demande", "commande.ouvrir")).toMatchObject({ genre: "fini", resultat: "demande_inconnue : fichiers.ouvrir" });
    nue.arreter();
  });
});

describe("fichiers archivés en base (protocole 1.2)", () => {
  const essayer = 'async (f) => { try { return await f(); } catch (e) { return e.name + " : " + e.message; } }';
  const code = `const essayer = ${essayer};
planche.sur("commande.regles", () => essayer(() => planche.fichiers.ouvrir([".json"], { archiver: true })));
planche.sur("commande.flux", () => essayer(() => planche.fichiers.ouvrir([".json"], { archiver: true, flux: true })));`;
  const ARCHIVE = { id: "sbxfic_1", empreinte: "b".repeat(64), ajouteLe: "2026-11-27T12:00:00.000Z" };
  const choisir = (v: unknown) => ({ ouvrir: (demande: unknown) => ({ reponse: Promise.resolve(v) as Promise<never>, fermer: () => void demande }), enregistrer: () => ({ reponse: Promise.resolve(false) as Promise<never>, fermer: () => {} }) });

  it("le fichier choisi est archivé avant d'être rendu : l'extension reçoit son archive", async () => {
    const recus: unknown[] = [];
    // La fenêtre rend aussi les octets d'origine (marque d'ordre comprise) : l'archive les reçoit tels quels, l'extension jamais.
    const octets = new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]);
    const fichiers = { ...choisir({ nom: "regles.json", texte: "{}", octets }), archiver: async (f: unknown, o?: Uint8Array) => (recus.push(f, o), { ok: true as const, archive: ARCHIVE }) };
    const h = creerHoteExtension(avecCode(code, ["fichiers"]), { creer: faux().creer, fichiers });
    expect(await h.appeler("demande", "commande.regles")).toEqual({ genre: "fini", resultat: { nom: "regles.json", texte: "{}", archive: ARCHIVE } });
    expect(recus).toEqual([{ nom: "regles.json", texte: "{}" }, octets]);
    h.arreter();
  });

  it("archivage refusé ou impossible : le fichier arrive sans archive, avec le motif ; jamais en flux", async () => {
    const refus = creerHoteExtension(avecCode(code, ["fichiers"]), { creer: faux().creer, fichiers: { ...choisir({ nom: "regles.json", texte: "{}" }), archiver: async () => ({ ok: false as const, motif: "connexion" as const }) } });
    expect(await refus.appeler("demande", "commande.regles")).toEqual({ genre: "fini", resultat: { nom: "regles.json", texte: "{}", archive: null, archiveRefus: "connexion" } });
    refus.arreter();
    const panne = creerHoteExtension(avecCode(code, ["fichiers"]), { creer: faux().creer, fichiers: { ...choisir({ nom: "regles.json", texte: "{}" }), archiver: () => Promise.reject(new Error("x")) } });
    expect(await panne.appeler("demande", "commande.regles")).toMatchObject({ genre: "fini", resultat: { archive: null, archiveRefus: "impossible" } });
    expect(await panne.appeler("demande", "commande.flux")).toMatchObject({ genre: "fini", resultat: expect.stringMatching(/^argument_invalide : archiver : pas en flux/) });
    panne.arreter();
    const sans = creerHoteExtension(avecCode(code, ["fichiers"]), { creer: faux().creer, fichiers: choisir({ nom: "regles.json", texte: "{}" }) });
    expect(await sans.appeler("demande", "commande.regles")).toMatchObject({ genre: "fini", resultat: { archive: null, archiveRefus: "indisponible" } });
    sans.arreter();
  });
});

describe("fichiers en flux et délai (protocole 1.1)", () => {
  function fenetres() {
    const ouvertes: { sorte: string; demande: unknown; repondre: (v: unknown) => void }[] = [];
    const fenetre = (sorte: string) => (demande: unknown) => {
      let repondre: (v: unknown) => void = () => {};
      const reponse = new Promise<unknown>((r) => (repondre = r));
      ouvertes.push({ sorte, demande, repondre });
      return { reponse: reponse as Promise<never>, fermer: () => {} };
    };
    const attendre = async () => {
      const avant = ouvertes.length;
      for (let i = 0; i < 500 && ouvertes.length === avant; i++) await pause(2);
      return ouvertes[ouvertes.length - 1]!;
    };
    return { ouvertes, attendre, fichiers: { ouvrir: fenetre("ouvrir"), enregistrer: fenetre("enregistrer") } };
  }
  const essayer = 'const essayer = async (f) => { try { return await f(); } catch (e) { return e.name + " : " + e.message; } };';
  const code = `${essayer}
let garde = null;
planche.sur("commande.lire", () => essayer(async () => { const f = await planche.fichiers.ouvrir([".dxf"], { flux: true }); garde = f; const t = await f.texte(); return [f.nom, f.taille, t.length]; }));
planche.sur("commande.relire", () => essayer(() => garde.lire(0, 10)));
planche.sur("commande.ecrire", () => essayer(() => planche.fichiers.enregistrer("plan.dxf", "y".repeat(1300000))));
planche.sur("commande.modele", () => essayer(async () => (await planche.modele.lire()).faces.length));`;

  it("un plan de plus de 1 000 000 caractères est lu en flux ; le jeton ne survit pas à la commande", async () => {
    const f = fenetres();
    const h = creerHoteExtension(avecCode(code, ["modele.lire", "fichiers"]), { creer: faux().creer, fichiers: f.fichiers });
    const appel = h.appeler("demande", "commande.lire");
    const fenetre = await f.attendre();
    expect(fenetre.demande).toEqual({ types: [".dxf"], flux: true });
    fenetre.repondre({ nom: "plan.dxf", texte: "0\nLINE\n".repeat(200_000) });
    expect(await appel).toEqual({ genre: "fini", resultat: ["plan.dxf", 1_400_000, 1_400_000] });
    expect(await h.appeler("demande", "commande.relire")).toMatchObject({ genre: "fini", resultat: expect.stringMatching(/^argument_invalide : jeton/) });
    h.arreter();
  });

  it("un texte long est enregistré par morceaux : la fenêtre reçoit le fichier entier", async () => {
    const f = fenetres();
    const h = creerHoteExtension(avecCode(code, ["modele.lire", "fichiers"]), { creer: faux().creer, fichiers: f.fichiers });
    const appel = h.appeler("demande", "commande.ecrire");
    const fenetre = await f.attendre();
    expect(fenetre.sorte).toBe("enregistrer");
    expect((fenetre.demande as { nom: string; texte: string }).texte).toHaveLength(1_300_000);
    fenetre.repondre(true);
    expect(await appel).toEqual({ genre: "fini", resultat: true });
    h.arreter();
  });

  it("le temps que la Planche passe à servir une demande ne compte pas dans le délai de la commande", async () => {
    const { acces } = plancheFausse();
    const lente: AccesPlanche = {
      ...acces,
      modele: () => {
        const fin = Date.now() + 120;
        while (Date.now() < fin) {
          /* la Planche travaille (un plan de milliers de segments) */
        }
        return acces.modele();
      },
    };
    const h = creerHoteExtension(avecCode(code, ["modele.lire", "fichiers"]), { creer: faux().creer, acces: lente, delaiCommandeMs: 60 });
    expect(await h.appeler("demande", "commande.modele")).toEqual({ genre: "fini", resultat: 0 });
    h.arreter();
  });
});

describe("panneau d'une extension (lot 4)", () => {
  const PANNEAU = { id: "reglages", titre: { fr: "Réglages", en: "Settings" }, page: "reglages.html", icone: "reglages.svg" };
  const avecPanneau = (code: string, permissions: readonly string[] = ["modele.lire", "panneau"]): PaquetExtension => {
    const p = avecCode(code, permissions as PaquetExtension["fiche"]["permissions"]);
    return { ...p, fiche: { ...p.fiche, panneaux: [PANNEAU] }, pages: { ...p.pages, "reglages.html": "<p>Réglages</p>", "reglages.svg": "<svg></svg>" } };
  };
  const nom = 'async (f) => { try { return await f(); } catch (e) { return e.name + " : " + e.message; } }';
  const code = `const essayer = ${nom};
planche.panneau.sur("reglages", "poser", (d) => essayer(async () => ({ envoye: await planche.panneau.envoyer("reglages", { recu: d }) })));
planche.sur("commande.ouvrir", () => essayer(() => planche.panneau.ouvrir("reglages")));
planche.sur("commande.autre", () => essayer(() => planche.panneau.envoyer("autre", 1)));`;

  it("une action de la page est une demande ; l'extension envoie des données à la page et ouvre le panneau", async () => {
    const recus: unknown[] = [];
    const ouverts: string[] = [];
    let ouvert = false;
    const panneau = { envoyer: (id: string, d: unknown) => (ouvert ? (recus.push([id, d]), true) : false), ouvrir: (id: string) => (ouverts.push(id), (ouvert = true)) };
    const h = creerHoteExtension(avecPanneau(code), { creer: faux().creer, panneau });
    expect(await h.appeler("demande", "panneau.reglages.poser", { h: 1 })).toEqual({ genre: "fini", resultat: { envoye: false } });
    expect(await h.appeler("demande", "commande.ouvrir")).toEqual({ genre: "fini", resultat: true });
    expect(ouverts).toEqual(["reglages"]);
    expect(await h.appeler("demande", "panneau.reglages.poser", { h: 2 })).toEqual({ genre: "fini", resultat: { envoye: true } });
    expect(recus).toEqual([["reglages", { recu: { h: 2 } }]]);
    expect(await h.appeler("demande", "panneau.reglages.inconnue")).toMatchObject({ genre: "erreur", nom: "demande_inconnue" });
    h.arreter();
  });

  it("refus nommés : panneau hors de la fiche, sans la permission, Planche sans panneau", async () => {
    const panneau = { envoyer: () => true, ouvrir: () => true };
    const h = creerHoteExtension(avecPanneau(code), { creer: faux().creer, panneau });
    expect(await h.appeler("demande", "commande.autre")).toMatchObject({ genre: "fini", resultat: expect.stringMatching(/^argument_invalide : panneau/) });
    h.arreter();
    const sans = creerHoteExtension(avecPanneau(code, ["modele.lire"]), { creer: faux().creer, panneau });
    expect(await sans.appeler("demande", "commande.ouvrir")).toMatchObject({ genre: "fini", resultat: "permission_refusee : panneau" });
    sans.arreter();
    const nue = creerHoteExtension(avecPanneau(code), { creer: faux().creer });
    expect(await nue.appeler("demande", "commande.ouvrir")).toMatchObject({ genre: "fini", resultat: "demande_inconnue : panneau.ouvrir" });
    nue.arreter();
  });
});
