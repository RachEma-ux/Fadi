/**
 * Extensions installées dans la Planche (protocole 1.0, lot 3) — ce que la Planche montre pour elles :
 *
 *  - `useExtensionsInstallees` : la liste reçue du serveur à l'ouverture (paquets relus par `lirePaquetsInstalles`) ;
 *    sans réseau ou sans compte, aucune extension installée n'est offerte ; avec elle, les extensions ajoutées que la
 *    plateforme propose au compte (`ajoutees`, cochées ou non dans le groupe « Extensions » de la liste « Outils ») et
 *    le geste « Afficher / Masquer » (`afficher`), qui relit ensuite les paquets ;
 *  - `IconeExtension` : l'icône d'une commande, un dessin SVG du paquet affiché comme une **image** (`<img>`) — rien de
 *    ce qu'il contient ne s'exécute ni n'atteint la page ;
 *  - `AvisExtensions` : les avis au-dessus de la barre d'état (demandés par une extension, ou posés par la Planche
 *    quand une commande échoue, dépasse son délai ou ne peut pas démarrer) ;
 *  - `DialogueSaisieExtension` : la fenêtre de saisie demandée par une extension ; la Planche la dessine, l'extension
 *    n'en fournit que les textes et reçoit des valeurs validées (`validerSaisie`).
 *  - `CadrePanneauExtension` (lot 4) : la page du panneau d'une extension, dans un cadre sans origine et sans réseau ;
 *    il ne passe entre elle et la Planche que des messages relus (`lireMessagePagePanneau`).
 *
 * Les textes venus d'une extension sont toujours posés comme du texte, jamais comme du balisage.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { BORNES_FICHIER, BORNES_PANNEAU, composerPagePanneau, donneesPanneau, lireMessagePagePanneau, lireNombreSaisi, typeDeFichier, valeursInitiales, validerSaisie, type DemandeEnregistrement, type DemandeOuverture, type DemandeSaisie, type FichePaquetCompte, type FichierLu, type PaquetExtension, type ValeursSaisie } from "@parcours/sandbox-planche-model";
import { LANGUE_INTERFACE, t } from "../messages";
import { IconeSandbox } from "../pictogrammes/Pictogramme";
import { choisirExtensionCompte, lireExtensionsServeur, lireFichesExtensionsCompte } from "../preferences/client";

/** Texte d'une fiche dans la langue de l'interface. */
export const texteFiche = (x: { readonly fr: string; readonly en: string }): string => (LANGUE_INTERFACE === "en" ? x.en : x.fr);

/** Ligne d'une extension ajoutée dans le groupe « Extensions » : son nom et sa case « Afficher / Masquer ». */
export interface ExtensionAjoutee {
  readonly id: string;
  readonly nom: string;
  /** Cochée : installée pour le compte (ses commandes, son panneau et ses raccourcis sont là). */
  readonly affichee: boolean;
}

/**
 * Lignes des extensions ajoutées (pur, testé) : celles que la plateforme propose au compte, par ordre alphabétique. Un
 * paquet reçu sans fiche (catalogue pas encore lu, ou illisible) a quand même sa ligne, cochée : ses commandes ne
 * disparaissent jamais faute de fiche.
 */
export function lignesExtensionsAjoutees(fiches: readonly FichePaquetCompte[], paquets: readonly PaquetExtension[] = [], langue: "fr" | "en" = LANGUE_INTERFACE === "en" ? "en" : "fr"): readonly ExtensionAjoutee[] {
  const lignes = fiches.map((f) => ({ id: f.id, nom: f.nom[langue], affichee: f.installee }));
  for (const p of paquets) if (!lignes.some((l) => l.id === p.fiche.id)) lignes.push({ id: p.fiche.id, nom: p.fiche.nom[langue], affichee: true });
  return lignes.sort((a, b) => a.nom.localeCompare(b.nom, langue));
}

export interface ExtensionsDuCompte {
  /** Paquets installés pour le compte, exécutables par la Planche. */
  readonly paquets: readonly PaquetExtension[];
  /** Extensions ajoutées proposées au compte, cochées ou non. */
  readonly ajoutees: readonly ExtensionAjoutee[];
  /** Coche (`true`) ou décoche une extension ajoutée pour le compte, puis relit les paquets installés. */
  readonly afficher: (id: string, affichee: boolean) => void;
}

export function useExtensionsInstallees(): ExtensionsDuCompte {
  const [paquets, setPaquets] = useState<readonly PaquetExtension[]>([]);
  const [fiches, setFiches] = useState<readonly FichePaquetCompte[]>([]);
  const vivant = useRef(true);
  const relirePaquets = () =>
    lireExtensionsServeur().then(
      (p) => vivant.current && setPaquets(p),
      () => undefined,
    );
  useEffect(() => {
    vivant.current = true;
    void relirePaquets();
    lireFichesExtensionsCompte().then(
      (f) => vivant.current && setFiches(f),
      () => undefined,
    );
    return () => {
      vivant.current = false;
    };
  }, []);
  const ajoutees = useMemo(() => lignesExtensionsAjoutees(fiches, paquets), [fiches, paquets]);
  const afficher = (id: string, affichee: boolean) => {
    // La case suit le geste tout de suite ; le serveur fait foi ensuite (fiches relues, paquets relus).
    setFiches((l) => l.map((f) => (f.id === id ? { ...f, installee: affichee } : f)));
    choisirExtensionCompte(id, affichee).then(
      (f) => {
        if (!vivant.current) return;
        setFiches(f);
        void relirePaquets();
      },
      () => {
        if (vivant.current) setFiches((l) => l.map((f) => (f.id === id ? { ...f, installee: !affichee } : f)));
      },
    );
  };
  return { paquets, ajoutees, afficher };
}

export function IconeExtension({ image, className }: { image: string; className?: string }) {
  return <img src={image} alt="" aria-hidden="true" draggable={false} className={`planche-extension-icone${className ? ` ${className}` : ""}`} />;
}

export interface AvisAffiche {
  readonly cle: number;
  /** Nom de l'extension, dans la langue de l'interface. */
  readonly extension: string;
  readonly texte: string;
  /** `arret` : posé par la Planche (échec, délai, démarrage impossible). */
  readonly genre: "info" | "alerte" | "arret";
}

/** Avis encore affichés après l'ajout d'un nouveau : les trois derniers. */
export const MAX_AVIS_AFFICHES = 3;
export const ajouterAvis = (liste: readonly AvisAffiche[], avis: AvisAffiche): readonly AvisAffiche[] => [...liste, avis].slice(-MAX_AVIS_AFFICHES);

export function AvisExtensions({ avis, onFermer }: { avis: readonly AvisAffiche[]; onFermer: (cle: number) => void }) {
  if (avis.length === 0) return null;
  return (
    <div className="planche-avis-extensions" role="region" aria-label={t("extensions.avis.liste")} data-planche-avis-extensions>
      {avis.map((a) => (
        <div key={a.cle} className="planche-avis-extension" role={a.genre === "info" ? "status" : "alert"} data-genre={a.genre} data-planche-avis-extension>
          <IconeSandbox nom="menuExtensions" className="planche-avis-extension-picto" />
          <div className="planche-avis-extension-corps">
            <strong>{a.extension}</strong>
            <div data-planche-avis-texte>{a.texte}</div>
          </div>
          <button type="button" className="planche-avis-extension-fermer" aria-label={t("extensions.avis.fermer")} title={t("extensions.avis.fermer")} onClick={() => onFermer(a.cle)} data-planche-avis-fermer>
            <IconeSandbox nom="fermer" />
          </button>
        </div>
      ))}
    </div>
  );
}

export interface SaisieOuverte {
  readonly cle: number;
  readonly extension: string;
  readonly demande: DemandeSaisie;
  /** Valeurs validées, ou `null` si l'utilisateur annule. */
  readonly repondre: (valeurs: ValeursSaisie | null) => void;
}

/** File des fenêtres de saisie sans celle de clé `cle` ; rend la même file si elle n'y est pas. */
export const retirerSaisie = (file: readonly SaisieOuverte[], cle: number): readonly SaisieOuverte[] => (file.some((x) => x.cle === cle) ? file.filter((x) => x.cle !== cle) : file);

const nombreAffiche = (n: number): string => String(n).replace(".", LANGUE_INTERFACE === "en" ? "." : ",");

export function DialogueSaisieExtension({ saisie }: { saisie: SaisieOuverte }) {
  const { demande } = saisie;
  const [valeurs, setValeurs] = useState<Record<string, string | boolean>>(() => Object.fromEntries(Object.entries(valeursInitiales(demande)).map(([id, v]) => [id, typeof v === "number" ? nombreAffiche(v) : v] as const)));
  const [erreur, setErreur] = useState<string | null>(null);
  const racine = useRef<HTMLFormElement | null>(null);
  useEffect(() => {
    racine.current?.querySelector<HTMLElement>("input, select")?.focus();
  }, []);
  const poser = (id: string, v: string | boolean) => {
    setErreur(null);
    setValeurs((avant) => ({ ...avant, [id]: v }));
  };
  const valider = () => {
    const r = validerSaisie(demande, valeurs);
    if (r.ok) return saisie.repondre(r.valeurs);
    const champ = demande.champs.find((c) => c.id === r.champ)!;
    const borne = champ.genre === "nombre" ? nombreAffiche((r.motif === "min" ? champ.min : champ.max) ?? 0) : "";
    setErreur(t(`extensions.saisie.erreur.${r.motif}`, { champ: champ.libelle, borne }));
    racine.current?.querySelector<HTMLElement>(`[data-saisie-champ="${r.champ}"]`)?.focus();
  };
  return (
    <div className="planche-recherche-fond" onPointerDown={(e) => e.target === e.currentTarget && saisie.repondre(null)}>
      <form
        ref={racine}
        className="planche-recherche planche-dialogue planche-saisie-extension"
        role="dialog"
        aria-modal="true"
        aria-label={demande.titre}
        data-planche-saisie-extension
        onSubmit={(e) => {
          e.preventDefault();
          valider();
        }}
        onKeyDown={(e) => {
          // Rien de ce qu'on tape dans la fenêtre n'atteint le clavier de la Planche.
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            saisie.repondre(null);
          }
        }}
      >
        <h3>{demande.titre}</h3>
        <p className="inspecteur-aide" data-planche-saisie-origine>{t("extensions.saisie.demandee", { extension: saisie.extension })}</p>
        {demande.champs.map((c) =>
          c.genre === "case" ? (
            <label key={c.id} className="planche-saisie-case">
              <input type="checkbox" checked={valeurs[c.id] === true} onChange={(e) => poser(c.id, e.target.checked)} data-saisie-champ={c.id} />
              {c.libelle}
            </label>
          ) : (
            <label key={c.id} className="planche-saisie-champ">
              <span>{c.genre === "nombre" && c.unite ? `${c.libelle} (${c.unite})` : c.libelle}</span>
              {c.genre === "choix" ? (
                <select value={String(valeurs[c.id])} onChange={(e) => poser(c.id, e.target.value)} data-saisie-champ={c.id}>
                  {c.choix.map((x) => (
                    <option key={x.valeur} value={x.valeur}>{x.libelle}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  inputMode={c.genre === "nombre" ? "decimal" : undefined}
                  autoComplete="off"
                  value={String(valeurs[c.id])}
                  aria-invalid={c.genre === "nombre" && lireNombreSaisi(String(valeurs[c.id])) === null ? true : undefined}
                  onChange={(e) => poser(c.id, e.target.value)}
                  data-saisie-champ={c.id}
                />
              )}
            </label>
          ),
        )}
        {erreur && <p className="planche-saisie-erreur" role="alert" data-planche-saisie-erreur>{erreur}</p>}
        <div className="planche-dialogue-actions">
          <button type="button" className="secondary" onClick={() => saisie.repondre(null)} data-planche-saisie-annuler>{t("extensions.saisie.annuler")}</button>
          <button type="submit" data-planche-saisie-valider>{t("extensions.saisie.valider")}</button>
        </div>
      </form>
    </div>
  );
}

/** Fenêtre de fichier demandée par une extension (lot 7) : l'utilisateur choisit le fichier à ouvrir, ou accepte d'enregistrer. */
export type FichierDemande =
  | { readonly cle: number; readonly extension: string; readonly sorte: "ouvrir"; readonly demande: DemandeOuverture; readonly repondre: (fichier: (FichierLu & { readonly octets?: Uint8Array }) | null) => void }
  | { readonly cle: number; readonly extension: string; readonly sorte: "enregistrer"; readonly demande: DemandeEnregistrement; readonly repondre: (accepte: boolean) => void };

export const retirerFichier = (file: readonly FichierDemande[], cle: number): readonly FichierDemande[] => (file.some((x) => x.cle === cle) ? file.filter((x) => x.cle !== cle) : file);

/** Lignes montrées avant d'enregistrer : l'utilisateur voit ce qu'il accepte. */
export const LIGNES_APERCU_FICHIER = 5;
const LARGEUR_APERCU_FICHIER = 90;
export function apercuFichier(texte: string): string {
  const lignes = texte.split(/\r?\n/);
  if (lignes.at(-1) === "") lignes.pop();
  const vues = lignes.slice(0, LIGNES_APERCU_FICHIER).map((l) => (l.length > LARGEUR_APERCU_FICHIER ? `${l.slice(0, LARGEUR_APERCU_FICHIER)}…` : l));
  if (lignes.length > LIGNES_APERCU_FICHIER) vues.push("…");
  return vues.join("\n");
}
/** Taille d'un texte enregistré en UTF-8, écrite pour l'utilisateur. */
export function tailleFichier(texte: string): string {
  const octets = new Blob([texte]).size;
  return octets < 1024 ? t("extensions.fichier.taille.octets", { n: String(octets) }) : t("extensions.fichier.taille.ko", { n: String(Math.round(octets / 1024)) });
}

export function DialogueFichierExtension({ fichier }: { fichier: FichierDemande }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const racine = useRef<HTMLFormElement | null>(null);
  const champ = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    racine.current?.querySelector<HTMLElement>("[data-planche-fichier-valider]")?.focus();
  }, []);
  const renoncer = () => (fichier.sorte === "ouvrir" ? fichier.repondre(null) : fichier.repondre(false));
  const choisi = async (f: File | undefined) => {
    if (!f || fichier.sorte !== "ouvrir") return;
    const type = typeDeFichier(f.name);
    if (!type || !fichier.demande.types.includes(type)) return setErreur(t("extensions.fichier.erreur.type", { types: fichier.demande.types.join(", ") }));
    // Un texte ne compte jamais plus de caractères que d'octets : un fichier plus lourd que la borne est refusé sans être lu.
    // (Protocole 1.1) Ouvert en flux, le fichier reste dans la Planche et la borne est celle du flux.
    const flux = fichier.demande.flux === true;
    // (Protocole 1.2) Un fichier à archiver garde ses octets d'origine : l'archive les range tels quels.
    const archiver = fichier.demande.archiver === true;
    const borne = flux ? BORNES_FICHIER.flux : archiver ? BORNES_FICHIER.archive : BORNES_FICHIER.caracteres;
    const trop = flux ? "extensions.fichier.erreur.taille.flux" : "extensions.fichier.erreur.taille";
    if (f.size > borne * 4) return setErreur(t(trop));
    let texte: string;
    let octets: Uint8Array | undefined;
    try {
      if (archiver) {
        octets = new Uint8Array(await f.arrayBuffer());
        // Même lecture que File.text() (UTF-8, marque d'ordre retirée du texte, jamais des octets).
        texte = new TextDecoder("utf-8").decode(octets);
      } else texte = await f.text();
    } catch {
      return setErreur(t("extensions.fichier.erreur.lecture"));
    }
    if (texte.length > borne) return setErreur(t(trop));
    fichier.repondre(octets ? { nom: f.name, texte, octets } : { nom: f.name, texte });
  };
  const titre = t(fichier.sorte === "ouvrir" ? "extensions.fichier.ouvrir.titre" : "extensions.fichier.enregistrer.titre");
  return (
    <div className="planche-recherche-fond" onPointerDown={(e) => e.target === e.currentTarget && renoncer()}>
      <form
        ref={racine}
        className="planche-recherche planche-dialogue planche-saisie-extension planche-fichier-extension"
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        data-planche-fichier-extension={fichier.sorte}
        onSubmit={(e) => {
          e.preventDefault();
          if (fichier.sorte === "enregistrer") fichier.repondre(true);
          else champ.current?.click();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            renoncer();
          }
        }}
      >
        <h3>{titre}</h3>
        <p className="inspecteur-aide" data-planche-saisie-origine>{t("extensions.saisie.demandee", { extension: fichier.extension })}</p>
        <dl className="planche-fichier-lignes">
          {fichier.sorte === "ouvrir" ? (
            <>
              <div><dt>{t("extensions.fichier.types")}</dt><dd data-planche-fichier-types>{fichier.demande.types.join(", ")}</dd></div>
              <div><dt>{t("extensions.fichier.taille")}</dt><dd data-planche-fichier-borne>{t(fichier.demande.flux ? "extensions.fichier.taille.borne.flux" : "extensions.fichier.taille.borne")}</dd></div>
            </>
          ) : (
            <>
              <div><dt>{t("extensions.fichier.nom")}</dt><dd data-planche-fichier-nom>{fichier.demande.nom}</dd></div>
              <div><dt>{t("extensions.fichier.taille")}</dt><dd data-planche-fichier-taille>{tailleFichier(fichier.demande.texte)}</dd></div>
            </>
          )}
        </dl>
        {fichier.sorte === "enregistrer" && <pre className="planche-fichier-apercu" data-planche-fichier-apercu>{apercuFichier(fichier.demande.texte)}</pre>}
        <p className="planche-fichier-note">{t(fichier.sorte === "ouvrir" ? "extensions.fichier.ouvrir.note" : "extensions.fichier.enregistrer.note")}</p>
        {fichier.sorte === "ouvrir" && <input ref={champ} type="file" hidden accept={fichier.demande.types.join(",")} onChange={(e) => void choisi(e.target.files?.[0])} data-planche-fichier-champ />}
        {erreur && <p className="planche-saisie-erreur" role="alert" data-planche-saisie-erreur>{erreur}</p>}
        <div className="planche-dialogue-actions">
          <button type="button" className="secondary" onClick={renoncer} data-planche-saisie-annuler>{t("extensions.saisie.annuler")}</button>
          <button type="submit" data-planche-fichier-valider>{t(fichier.sorte === "ouvrir" ? "extensions.fichier.ouvrir.choisir" : "extensions.fichier.enregistrer.valider")}</button>
        </div>
      </form>
    </div>
  );
}

/** Clé d'un panneau d'extension dans la colonne de la Planche. */
export const clePanneauExtension = (extension: string, panneau: string): string => `extension:${extension}:${panneau}`;

/** Réponse de l'extension à une action de la page de son panneau. */
export type ReponseActionPanneau = { readonly ok: true; readonly resultat: unknown } | { readonly ok: false; readonly erreur: string; readonly detail: string };

/**
 * Page du panneau d'une extension (lot 4, image 16). Le cadre n'a pas d'origine (`sandbox="allow-scripts"`, sans
 * `allow-same-origin`) : la page ne voit ni la Planche, ni le compte, ni l'enregistrement local ; sa règle de contenu
 * interdit tout réseau. `appeler` adresse une action nommée à l'extension ; `brancher` reçoit ce que l'extension envoie.
 */
export function CadrePanneauExtension({ paquet, panneau, titre, appeler, brancher }: {
  paquet: PaquetExtension;
  panneau: string;
  titre: string;
  appeler: (action: string, donnees: unknown) => Promise<ReponseActionPanneau>;
  brancher: (recevoir: (donnees: unknown) => void) => () => void;
}) {
  const cadre = useRef<HTMLIFrameElement>(null);
  const [hauteur, setHauteur] = useState<number>(BORNES_PANNEAU.hauteurMin);
  const page = useMemo(() => composerPagePanneau(paquet, panneau, LANGUE_INTERFACE), [paquet, panneau]);
  const appelerRef = useRef(appeler);
  appelerRef.current = appeler;
  useEffect(() => {
    let monte = true;
    let enAttente = 0;
    const poster = (m: unknown) => monte && cadre.current?.contentWindow?.postMessage(m, "*");
    const recevoir = (e: MessageEvent) => {
      // Seule la page de ce cadre est écoutée ; ce qu'elle dit est relu avant tout usage.
      if (!cadre.current || e.source !== cadre.current.contentWindow) return;
      const m = lireMessagePagePanneau(e.data);
      if (!m) return;
      if (m.sorte === "hauteur") return setHauteur(m.px);
      const refuser = (detail: string) => poster({ fadi: "reponse", id: m.id, ok: false, erreur: "argument_invalide", detail });
      if (m.donnees === undefined) return void refuser(`donnees : des données seulement, ${BORNES_PANNEAU.donnees} caractères au plus`);
      if (enAttente >= BORNES_PANNEAU.enAttente) return void refuser("trop d'actions en attente");
      enAttente++;
      void appelerRef.current(m.nom, m.donnees).then((r) => {
        enAttente--;
        if (!r.ok) return void poster({ fadi: "reponse", id: m.id, ok: false, erreur: r.erreur, detail: r.detail });
        const resultat = donneesPanneau(r.resultat);
        if (resultat === undefined) return void refuser("réponse trop grande");
        poster({ fadi: "reponse", id: m.id, ok: true, resultat });
      });
    };
    window.addEventListener("message", recevoir);
    const debrancher = brancher((donnees) => poster({ fadi: "donnees", donnees }));
    return () => {
      monte = false;
      window.removeEventListener("message", recevoir);
      debrancher();
    };
  }, [brancher, page]);
  if (page === null) return null;
  return (
    <>
      <iframe ref={cadre} className="planche-panneau-extension-cadre" title={titre} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={page} style={{ height: hauteur }} data-planche-panneau-cadre />
      <p className="planche-fichier-note planche-panneau-extension-note" data-planche-panneau-note>{t("extensions.panneau.note")}</p>
    </>
  );
}
