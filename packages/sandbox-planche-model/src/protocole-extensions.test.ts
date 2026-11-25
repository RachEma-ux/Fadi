/** Protocole des extensions, lot 1 : paquet, fiche, versions, messages, espace d'exécution. */
import { describe, expect, it } from "vitest";
import {
  BORNES_EXTENSION, FORMAT_PAQUET_EXTENSION, VERSION_PROTOCOLE, creerExecutantExtension, demandeProtocole, evenementProtocole, jugerDemandeExtension,
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
  });

  it("une déclaration sans sa permission est refusée ; avec, elle est acceptée", () => {
    const panneau = { id: "reglages", titre: { fr: "Réglages", en: "Settings" }, page: "reglages.html" };
    const pages = { "saluer.svg": ICONE, "reglages.html": "<p>Réglages</p>" };
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
    expect(VERSION_PROTOCOLE).toBe("1.0");
    expect(jugerVersionProtocole("1.0")).toBe("acceptee");
    expect(jugerVersionProtocole("1.1")).toBe("trop_recente");
    expect(jugerVersionProtocole("2.0")).toBe("trop_recente");
    expect(jugerVersionProtocole("0.9")).toBe("trop_ancienne");
    expect(jugerVersionProtocole("un")).toBe("mal_formee");
    // Règle d'évolution : la Planche accepte sa version majeure et la précédente, pas plus loin.
    expect(jugerVersionProtocole("2.3", "3.1")).toBe("acceptee");
    expect(jugerVersionProtocole("3.0", "3.1")).toBe("acceptee");
    expect(jugerVersionProtocole("1.9", "3.1")).toBe("trop_ancienne");
    expect(refuse(paquet({}, { protocole: "1.1" }))).toMatch(/^version_non_prise_en_charge — fiche : protocole 1\.1/);
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
    expect(recus).toEqual([demandeProtocole(1, "journal.afficher", { ligne: "prête essai-socle 1.0" }), reponseProtocole(10, 1), reponseProtocole(11, 2)]);
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

  it("un message illisible est ignoré", () => {
    const { x, recus } = lancer('planche.sur("commande.saluer", () => "bonjour");');
    x.demarrer();
    x.recevoir({ sorte: "demande", nom: "commande.saluer" });
    x.recevoir("texte");
    expect(recus).toEqual([]);
  });
});
