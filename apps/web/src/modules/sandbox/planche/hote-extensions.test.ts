/** Hôte d'une extension (protocole 1.0, lot 1) : espace isolé durable, limites de temps, arrêt et redémarrage. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ajouterRectangle, creerExecutantExtension, modeleVide, v3, validerPaquetExtension, type AccesPlanche, type AvisExtension, type DemandeSaisie, type ValeursSaisie, type ExecutantExtension, type Id, type Modele, type PaquetExtension } from "@parcours/sandbox-planche-model";
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
    expect(recus).toEqual([{ protocole: "1.0", sorte: "reponse", id: 7, ok: false, resultat: null, erreur: { nom: "demande_inconnue", detail: "serveur.appeler" } }]);
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
