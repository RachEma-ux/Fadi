/** Protocole des extensions, lot 1 : paquet, fiche, versions, messages, espace d'exécution. */
import { describe, expect, it } from "vitest";
import {
  BORNES_EXTENSION, BORNES_FICHIER, FORMAT_PAQUET_EXTENSION, VERSION_PROTOCOLE, creerExecutantExtension, demandeProtocole, evenementProtocole, jugerDemandeExtension,
  jugerVersionProtocole, lireMessageProtocole, refusProtocole, reponseProtocole, validerPaquetExtension, type MessageProtocole,
} from "./index.js";

const ICONE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>';
const fiche = (plus: Record<string, unknown> = {}) => ({
  id: "essai-socle",
  nom: { fr: "Essai du socle", en: "Base trial" },
  description: { fr: "Extension d'essai du lot 1.", en: "Trial add-on for lot 1." },
  version: "1.0.0",
  auteur: "Fadi",
  protocole: "1.0",
  permissions: ["modele.lire"],
  commandes: [{ id: "saluer", libelle: { fr: "Saluer", en: "Greet" }, icone: "saluer.svg", raccourci: "Alt+Maj+S" }],
  outils: [],
  panneaux: [],
  abonnements: [],
  ...plus,
});
const paquet = (plus: Record<string, unknown> = {}, ficheEn: Record<string, unknown> = {}) => ({
  format: FORMAT_PAQUET_EXTENSION,
  fiche: fiche(ficheEn),
  code: 'planche.sur("commande.saluer", () => "bonjour");',
  pages: { "saluer.svg": ICONE },
  ...plus,
});
const refuse = (v: unknown) => {
  const r = validerPaquetExtension(v);
  return r.ok ? "accepté" : `${r.erreur} — ${r.detail}`;
};

describe("paquet d'extension fadi-addon/1", () => {
  it("un paquet bien formé est accepté et rendu tel quel", () => {
    const r = validerPaquetExtension(paquet());
    expect(r).toMatchObject({ ok: true, paquet: { format: "fadi-addon/1", fiche: { id: "essai-socle", protocole: "1.0", commandes: [{ id: "saluer", raccourci: "Alt+Maj+S" }] } } });
  });

  it("forme stricte : champ inconnu, absent ou mal formé → refus motivé, jamais filtré", () => {
    expect(refuse(null)).toMatch(/^forme_invalide/);
    expect(refuse(paquet({ binaire: "AAAA" }))).toMatch(/champ inconnu « binaire »/);
    expect(refuse(paquet({}, { id: "Essai Socle" }))).toMatch(/identifiant mal formé/);
    expect(refuse(paquet({}, { version: "1.0" }))).toMatch(/version de la forme 1\.2\.0/);
    expect(refuse(paquet({}, { nom: { fr: "Essai" } }))).toMatch(/nom\.en/);
    expect(refuse(paquet({}, { permissions: ["reseau"] }))).toMatch(/« reseau » inconnue/);
    expect(refuse(paquet({}, { abonnements: ["vue.change"] }))).toMatch(/« vue\.change » inconnu/);
    expect(refuse(paquet({ code: "   " }))).toMatch(/code : texte non vide/);
    expect(refuse(paquet({ pages: { "../evasion.html": "x" } }))).toMatch(/nom de fichier mal formé/);
  });

  it("commandes : icône du paquet et raccourci obligatoires, identifiants et raccourcis uniques", () => {
    const c = (plus: Record<string, unknown>) => ({ id: "saluer", libelle: { fr: "Saluer", en: "Greet" }, icone: "saluer.svg", raccourci: "Alt+Maj+S", ...plus });
    expect(refuse(paquet({}, { commandes: [c({ raccourci: undefined })] }))).toMatch(/raccourci obligatoire/);
    expect(refuse(paquet({}, { commandes: [c({ raccourci: "alt+s" })] }))).toMatch(/raccourci obligatoire/);
    expect(refuse(paquet({}, { commandes: [c({ icone: "absente.svg" })] }))).toMatch(/icône absente du paquet/);
    expect(refuse(paquet({}, { commandes: [c({}), c({ raccourci: "Alt+Maj+T" })] }))).toMatch(/« saluer » déclaré deux fois/);
    expect(refuse(paquet({}, { commandes: [c({}), c({ id: "autre" })] }))).toMatch(/« Alt\+Maj\+S » déclaré deux fois/);
    // Règle d'or : une icône par commande ou outil, jamais partagée.
    expect(refuse(paquet({}, { commandes: [c({}), c({ id: "autre", raccourci: "Alt+Maj+T" })] }))).toMatch(/icônes : « saluer\.svg » déclaré deux fois/);
    expect(refuse(paquet({ pages: { "saluer.svg": ICONE, "autre.svg": ICONE } }, { commandes: [c({}), c({ id: "autre", raccourci: "Alt+Maj+T", icone: "autre.svg" })] }))).toBe("accepté");
    // L'identifiant devient « commande.<id> » : il commence par une lettre, comme tout segment de nom de message.
    expect(refuse(paquet({}, { commandes: [c({ id: "123" })] }))).toMatch(/identifiant mal formé/);
    expect(lireMessageProtocole(demandeProtocole(1, "commande.vue-2d", null))).not.toBeNull();
  });

  it("une déclaration sans sa permission est refusée ; avec, elle est acceptée", () => {
    const panneau = { id: "reglages", titre: { fr: "Réglages", en: "Settings" }, page: "reglages.html", icone: "reglages.svg" };
    const pages = { "saluer.svg": ICONE, "reglages.svg": ICONE, "reglages.html": "<p>Réglages</p>" };
    // Règle d'or : le panneau a sa propre icône, présente dans le paquet, jamais celle d'une commande.
    expect(refuse(paquet({ pages }, { panneaux: [{ ...panneau, icone: "absente.svg" }], permissions: ["panneau"] }))).toMatch(/icône absente du paquet/);
    expect(refuse(paquet({ pages }, { panneaux: [{ ...panneau, icone: "saluer.svg" }], permissions: ["panneau"] }))).toMatch(/icônes : « saluer\.svg » déclaré deux fois/);
    expect(refuse(paquet({ pages }, { panneaux: [panneau] }))).toMatch(/sans la permission « panneau »/);
    expect(refuse(paquet({ pages }, { panneaux: [panneau], permissions: ["panneau"] }))).toBe("accepté");
    expect(refuse(paquet({}, { panneaux: [{ ...panneau, page: "absente.html" }], permissions: ["panneau"] }))).toMatch(/page absente du paquet/);
    expect(refuse(paquet({}, { abonnements: ["selection.change"] }))).toMatch(/sans la permission « evenements »/);
    expect(refuse(paquet({}, { abonnements: ["selection.change"], permissions: ["evenements"] }))).toBe("accepté");
  });

  it("bornes : code de 200 000 caractères au plus, paquet de 1 Mo au plus", () => {
    expect(refuse(paquet({ code: "x".repeat(BORNES_EXTENSION.code) }))).toBe("accepté");
    expect(refuse(paquet({ code: "x".repeat(BORNES_EXTENSION.code + 1) }))).toMatch(/^hors_bornes — code/);
    expect(refuse(paquet({ pages: { "saluer.svg": ICONE, "gros.html": "x".repeat(BORNES_EXTENSION.paquet) } }))).toMatch(/^hors_bornes — paquet/);
  });

  it("versions : la version courante est acceptée, une plus récente ou une trop ancienne est refusée avec son motif", () => {
    expect(VERSION_PROTOCOLE).toBe("1.3");
    expect(jugerVersionProtocole("1.3")).toBe("acceptee");
    // 1.1 à 1.3 ne font qu'ajouter : une extension écrite pour 1.0, 1.1 ou 1.2 reste acceptée.
    expect(jugerVersionProtocole("1.2")).toBe("acceptee");
    expect(jugerVersionProtocole("1.1")).toBe("acceptee");
    expect(jugerVersionProtocole("1.0")).toBe("acceptee");
    expect(jugerVersionProtocole("1.4")).toBe("trop_recente");
    expect(jugerVersionProtocole("2.0")).toBe("trop_recente");
    expect(jugerVersionProtocole("0.9")).toBe("trop_ancienne");
    expect(jugerVersionProtocole("un")).toBe("mal_formee");
    // Règle d'évolution : la Planche accepte sa version majeure et la précédente, pas plus loin.
    expect(jugerVersionProtocole("2.3", "3.1")).toBe("acceptee");
    expect(jugerVersionProtocole("3.0", "3.1")).toBe("acceptee");
    expect(jugerVersionProtocole("1.9", "3.1")).toBe("trop_ancienne");
    expect(refuse(paquet({}, { protocole: "1.4" }))).toMatch(/^version_non_prise_en_charge — fiche : protocole 1\.4/);
    expect(refuse(paquet({}, { protocole: "1.3" }))).toBe("accepté");
    expect(refuse(paquet({}, { protocole: "1.2" }))).toBe("accepté");
    expect(refuse(paquet({}, { protocole: "1.1" }))).toBe("accepté");
    expect(refuse(paquet({ format: "fadi-addon/2" }))).toMatch(/^version_non_prise_en_charge/);
  });
});

describe("messages du protocole", () => {
  it("demande, réponse, refus et événement sont relus à l'identique", () => {
    for (const m of [demandeProtocole(1, "commande.saluer", { n: 2 }), reponseProtocole(1, "ok"), refusProtocole(2, "delai_depasse", "5000"), evenementProtocole(3, "selection.change", [])]) {
      expect(lireMessageProtocole(JSON.parse(JSON.stringify(m)))).toEqual(m);
    }
  });

  it("un message illisible n'est jamais interprété", () => {
    const base = demandeProtocole(1, "commande.saluer");
    expect(lireMessageProtocole(null)).toBeNull();
    expect(lireMessageProtocole({ ...base, protocole: "9.0" })).toBeNull();
    expect(lireMessageProtocole({ ...base, id: -1 })).toBeNull();
    expect(lireMessageProtocole({ ...base, nom: "Commande Saluer" })).toBeNull();
    expect(lireMessageProtocole({ ...base, sorte: "ordre" })).toBeNull();
    expect(lireMessageProtocole({ ...refusProtocole(1, "delai_depasse"), erreur: { nom: "inventee", detail: "" } })).toBeNull();
  });

  it("demandes d'une extension : seules celles de la table sont admises, avec la permission exigée", () => {
    expect(jugerDemandeExtension({ permissions: [] }, "journal.afficher")).toEqual({ ok: true });
    expect(jugerDemandeExtension({ permissions: ["modele.lire"] }, "serveur.appeler")).toEqual({ ok: false, erreur: "demande_inconnue", detail: "serveur.appeler" });
  });
});

describe("espace d'exécution d'une extension", () => {
  const lancer = (code: string) => {
    const recus: MessageProtocole[] = [];
    const x = creerExecutantExtension({ fiche: { id: "essai-socle", version: "1.0.0" }, code }, (m) => recus.push(m));
    return { x, recus };
  };

  it("reste en vie : le code est lu une fois, puis répond à plusieurs demandes en gardant son état", () => {
    const { x, recus } = lancer('let n = 0; planche.sur("commande.compter", () => ++n); planche.afficher("prête", planche.extension.id, planche.protocole);');
    expect(x.demarrer()).toBeNull();
    expect(x.demarrer()).toBeNull();
    x.recevoir(demandeProtocole(10, "commande.compter"));
    x.recevoir(demandeProtocole(11, "commande.compter"));
    expect(recus).toEqual([demandeProtocole(1, "journal.afficher", { ligne: "prête essai-socle 1.3" }), reponseProtocole(10, 1), reponseProtocole(11, 2)]);
  });

  it("demande sans traitement → erreur nommée ; événement sans traitement → simple accusé", () => {
    const { x, recus } = lancer('planche.sur("selection.change", (s) => planche.afficher(s.length + " objet(s)"));');
    x.demarrer();
    x.recevoir(demandeProtocole(1, "commande.absente"));
    x.recevoir(evenementProtocole(2, "projet.ouvert", { nom: "Essai" }));
    x.recevoir(evenementProtocole(3, "selection.change", ["a", "b"]));
    expect(recus).toEqual([refusProtocole(1, "demande_inconnue", "commande.absente"), reponseProtocole(2), demandeProtocole(1, "journal.afficher", { ligne: "2 objet(s)" }), reponseProtocole(3)]);
  });

  it("une erreur dans un traitement, ou un résultat qui n'est pas des données, est rendu par son nom, et l'extension continue de répondre", () => {
    const { x, recus } = lancer('planche.sur("commande.casser", () => { throw new Error("panne voulue"); }); planche.sur("commande.suite", () => "toujours là"); planche.sur("commande.fonction", () => () => 1);');
    x.demarrer();
    x.recevoir(demandeProtocole(1, "commande.casser"));
    x.recevoir(demandeProtocole(2, "commande.suite"));
    x.recevoir(demandeProtocole(3, "commande.fonction"));
    expect(recus).toEqual([refusProtocole(1, "echec_extension", "panne voulue"), reponseProtocole(2, "toujours là"), refusProtocole(3, "argument_invalide", "résultat non transmissible : des données seulement")]);
  });

  it("démarrage : le mot « import », une faute de syntaxe ou une erreur au chargement sont rendus, rien ne tourne ensuite", () => {
    expect(lancer('const m = import("x");').x.demarrer()).toEqual({ genre: "import" });
    expect(lancer("function (").x.demarrer()).toMatchObject({ genre: "syntaxe" });
    const { x, recus } = lancer('planche.sur("Mal Formé", () => 1);');
    expect(x.demarrer()).toMatchObject({ genre: "execution" });
    x.recevoir(demandeProtocole(1, "commande.saluer"));
    expect(recus).toEqual([]);
  });

  it("lot 2 — demandes à la Planche : promesse tenue par la réponse, rejetée par l'erreur nommée ; un traitement async clôt l'appel à sa fin", async () => {
    const { x, recus } = lancer('planche.sur("commande.lire", async () => { const m = await planche.modele.lire(); try { await planche.operation.ouvrir("A"); } catch (e) { return [m.faces.length, e.name]; } });');
    expect(x.demarrer()).toBeNull();
    x.recevoir(demandeProtocole(7, "commande.lire"));
    expect(recus).toMatchObject([{ sorte: "demande", nom: "modele.lire" }]);
    x.recevoir(reponseProtocole(recus[0]!.id, { faces: [1, 2], aretes: [], objets: [], enOperation: false }));
    await Promise.resolve();
    await Promise.resolve();
    expect(recus[1]).toMatchObject({ sorte: "demande", nom: "operation.ouvrir", donnees: { nom: "A" } });
    x.recevoir(refusProtocole(recus[1]!.id, "permission_refusee", "modele.modifier"));
    await new Promise((r) => setTimeout(r, 0));
    expect(recus[2]).toEqual(reponseProtocole(7, [2, "permission_refusee"]));
  });

  it("lot 2 — l'objet planche offre les dix fonctions de dessin, l'opération et la sélection ; un traitement async qui échoue est rendu par son nom", async () => {
    const { x, recus } = lancer('planche.sur("commande.noms", () => [Object.keys(planche.modele), Object.keys(planche.operation), Object.keys(planche.selection)]); planche.sur("commande.rate", async () => { throw new Error("raté"); });');
    expect(x.demarrer()).toBeNull();
    x.recevoir(demandeProtocole(1, "commande.noms"));
    expect(recus[0]).toEqual(reponseProtocole(1, [["lire", "ligne", "rectangle", "boite", "pousser", "deplacer", "copier", "tourner", "grouper", "composant", "effacer", "lignes", "arc", "cercle"], ["ouvrir", "valider", "abandonner"], ["lire", "definir"]]));
    x.recevoir(demandeProtocole(2, "commande.rate"));
    await new Promise((r) => setTimeout(r, 0));
    expect(recus[1]).toEqual(refusProtocole(2, "echec_extension", "raté"));
  });

  it("un message illisible est ignoré", () => {
    const { x, recus } = lancer('planche.sur("commande.saluer", () => "bonjour");');
    x.demarrer();
    x.recevoir({ sorte: "demande", nom: "commande.saluer" });
    x.recevoir("texte");
    expect(recus).toEqual([]);
  });
});

describe("espace d'exécution — protocole 1.1", () => {
  /** Exécutant relié à une Planche de remplacement qui répond à chaque demande par `servir`. */
  const relier = (code: string, servir: (nom: string, donnees: unknown) => unknown) => {
    const demandes: { nom: string; donnees: unknown }[] = [];
    const reponses: MessageProtocole[] = [];
    let x: ReturnType<typeof creerExecutantExtension>;
    const poster = (m: MessageProtocole) => {
      if (m.sorte !== "demande") return void reponses.push(m);
      demandes.push({ nom: m.nom, donnees: m.donnees });
      setTimeout(() => x.recevoir(reponseProtocole(m.id, servir(m.nom, m.donnees))), 0);
    };
    x = creerExecutantExtension({ fiche: { id: "essai-plan", version: "1.0.0" }, code }, poster);
    expect(x.demarrer()).toBeNull();
    const attendre = async () => {
      for (let i = 0; i < 500 && reponses.length === 0; i++) await new Promise((r) => setTimeout(r, 0));
      return reponses.shift();
    };
    return { x, demandes, attendre };
  };

  it("fichier ouvert en flux : lu morceau par morceau, recollé à l'identique", async () => {
    const texte = "0\nLINE\n".repeat(150_000);
    const { x, demandes, attendre } = relier(
      'planche.sur("commande.lire", async () => { const f = await planche.fichiers.ouvrir([".dxf"], { flux: true }); const t = await f.texte(); return [f.nom, f.taille, t.length, t.slice(0, 7)]; });',
      (nom, d) => (nom === "fichiers.ouvrir" ? { nom: "plan.dxf", taille: texte.length, jeton: 3 } : texte.slice((d as { debut: number }).debut, (d as { debut: number }).debut + (d as { longueur: number }).longueur)),
    );
    x.recevoir(demandeProtocole(1, "commande.lire"));
    expect(await attendre()).toEqual(reponseProtocole(1, ["plan.dxf", texte.length, texte.length, "0\nLINE\n"]));
    expect(demandes[0]).toEqual({ nom: "fichiers.ouvrir", donnees: { types: [".dxf"], flux: true } });
    expect(demandes.slice(1).every((d) => d.nom === "fichiers.lire" && (d.donnees as { jeton: number }).jeton === 3)).toBe(true);
    expect(demandes).toHaveLength(1 + Math.ceil(texte.length / BORNES_FICHIER.morceau));
  });

  it("texte long à enregistrer : préparé, ajouté par morceaux, puis enregistré par son jeton ; un texte court part d'un coup", async () => {
    const { x, demandes, attendre } = relier(
      'planche.sur("commande.long", () => planche.fichiers.enregistrer("plan.dxf", "x".repeat(1200000))); planche.sur("commande.court", () => planche.fichiers.enregistrer("plan.dxf", "0\\nEOF\\n"));',
      (nom) => (nom === "fichiers.preparer" ? 9 : nom === "fichiers.enregistrer" ? true : null),
    );
    x.recevoir(demandeProtocole(1, "commande.long"));
    expect(await attendre()).toEqual(reponseProtocole(1, true));
    expect(demandes.map((d) => d.nom)).toEqual(["fichiers.preparer", "fichiers.ajouter", "fichiers.ajouter", "fichiers.ajouter", "fichiers.enregistrer"]);
    expect(demandes.at(-1)!.donnees).toEqual({ nom: "plan.dxf", jeton: 9 });
    demandes.length = 0;
    x.recevoir(demandeProtocole(2, "commande.court"));
    expect(await attendre()).toEqual(reponseProtocole(2, true));
    expect(demandes).toEqual([{ nom: "fichiers.enregistrer", donnees: { nom: "plan.dxf", texte: "0\nEOF\n" } }]);
  });

  it("modele.lire transmet sa portée, balises.creer son nom et sa couleur, et les courbes passent par modele.modifier", async () => {
    const { x, demandes, attendre } = relier(
      'planche.sur("commande.tout", async () => { await planche.modele.lire({ portee: "monde" }); await planche.modele.lire(); await planche.balises.creer("Murs", "#aa3300"); await planche.modele.arc([1,0,0],[0,1,0],[-1,0,0]); return true; });',
      () => null,
    );
    x.recevoir(demandeProtocole(1, "commande.tout"));
    expect(await attendre()).toEqual(reponseProtocole(1, true));
    expect(demandes).toEqual([
      { nom: "modele.lire", donnees: { portee: "monde" } },
      { nom: "modele.lire", donnees: null },
      { nom: "balises.creer", donnees: { nom: "Murs", couleur: "#aa3300" } },
      { nom: "modele.modifier", donnees: { fonction: "arc", arguments: [[1, 0, 0], [0, 1, 0], [-1, 0, 0]] } },
    ]);
  });

  it("(1.3) cotes.creer, textes.creer et objets.verrouiller transmettent leurs arguments", async () => {
    const { x, demandes, attendre } = relier(
      'planche.sur("commande.trame", async () => { await planche.cotes.creer([0,0,0],[6,0,0],[0,-1,0]); await planche.cotes.creer([0,0,0],[0,4,0],[-1,0,0],"axe-y"); await planche.textes.creer([0,0,0],[0,-2,0],"A"); await planche.objets.verrouiller("g1"); await planche.objets.verrouiller(["g1"], false); return true; });',
      () => null,
    );
    x.recevoir(demandeProtocole(1, "commande.trame"));
    expect(await attendre()).toEqual(reponseProtocole(1, true));
    expect(demandes).toEqual([
      { nom: "cotes.creer", donnees: { a: [0, 0, 0], b: [6, 0, 0], position: [0, -1, 0] } },
      { nom: "cotes.creer", donnees: { a: [0, 0, 0], b: [0, 4, 0], position: [-1, 0, 0], direction: "axe-y" } },
      { nom: "textes.creer", donnees: { ancre: [0, 0, 0], position: [0, -2, 0], texte: "A" } },
      { nom: "objets.verrouiller", donnees: { ids: ["g1"], verrou: true } },
      { nom: "objets.verrouiller", donnees: { ids: ["g1"], verrou: false } },
    ]);
  });
});
