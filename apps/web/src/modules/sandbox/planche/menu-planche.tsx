/**
 * Menu de la Planche de Sandbox (pictogramme ☰ Tabler « menu-2 », MIT) : Ouvrir, Nouvelle, Enregistrer, Enregistrer
 * sous, Renommer / niveau de référence, Supprimer, Partager, Exporter et Importer (IFC, OBJ, STL), Informations
 * (page dans le style d'Excel), PNG de la vue et Extensions (25 novembre 2026 : la fenêtre à interrupteurs s'ouvre à la
 * place de la liste, sous ☰). Les Planches de Sandbox sont nommées mais locales à ce navigateur :
 * aucun projet, aucun serveur. Composant pur : il reçoit les Planches et des rappels ; la Planche exécute.
 */
import { useEffect, useRef, useState } from "react";
import { LANGUE_INTERFACE, t } from "../messages";
import type { Modele, Pictogramme as DescriptionPictogramme } from "@parcours/sandbox-planche-model";
import { IconeSandbox, Pictogramme } from "../pictogrammes/Pictogramme";
import { DELAI_APPUI_MS, SEUIL_MOUVEMENT_PX, bornerPosition, coteOuverture, ecrirePositionMenu, lirePositionMenu, stockageLocal, type PositionMenu } from "./deplacement-menu";
import { InformationsPlancheVue, type InformationsPlanche } from "./informations-planche";
import { altitudeSaisie, nomValide, type InfoPlanche } from "./registre-planches";
import type { EtatSauvegarde } from "./sauvegarde-brouillon";

export type FormatEchange = "ifc" | "obj" | "stl";
export const FORMATS_ECHANGE: readonly FormatEchange[] = ["ifc", "obj", "stl"];
export type UniteFichier = "m" | "cm" | "mm";
export const ECHELLE_UNITE: Readonly<Record<UniteFichier, number>> = { m: 1, cm: 0.01, mm: 0.001 };
const ACCEPT: Readonly<Record<FormatEchange, string>> = { ifc: ".ifc", obj: ".obj", stl: ".stl" };

export interface ActionsMenuPlanche {
  ouvrir(id: string): Promise<void>;
  /** Cas 2, lot 4 : `modele` = Planche créée depuis un gabarit d'agence ; absent, Planche vide. */
  creer(nom: string, altitude: number | null, modele?: Modele): Promise<void>;
  enregistrer(): Promise<void>;
  enregistrerSous(nom: string): Promise<void>;
  renommer(nom: string, altitude: number | null): Promise<void>;
  supprimer(): Promise<void>;
  partager(): Promise<void>;
  /** Liens de consultation (cas 4, étape 7d) : ouvre le panneau « Liens de consultation ». */
  liensConsultation(): Promise<void>;
  /** Fonds calés (cas 4, lot C4, étape 1) : ouvre le panneau « Fonds calés » et le choix d'une image. */
  importerFond(): Promise<void>;
  exporter(format: FormatEchange): Promise<void>;
  importer(format: FormatEchange, fichier: File, unite: UniteFichier): Promise<void>;
  telechargerPng(): Promise<void>;
  informations(): InformationsPlanche;
}

/** Une extension telle que la fenêtre « Extensions » l'affiche : textes déjà traduits, état du compte. */
export interface ExtensionAffichee {
  readonly id: string;
  readonly nom: string;
  readonly description: string;
  readonly picto: DescriptionPictogramme;
  /** « 6 outils · 5 commandes · 1 panneau ». */
  readonly contenu: string;
  readonly active: boolean;
}

/** Fenêtre « Extensions » du menu : la liste, la bascule (effet immédiat) et l'état d'enregistrement du compte. */
export interface ExtensionsMenu {
  readonly liste: readonly ExtensionAffichee[];
  basculer(id: string, active: boolean): void;
  /** Les choix n'ont pas encore rejoint le compte (hors connexion, erreur) : la fenêtre le dit. */
  readonly enAttente: boolean;
}

/** Pastille de l'entrée « Extensions » : nombre d'extensions actives. */
export function pastilleExtensions(liste: readonly Pick<ExtensionAffichee, "active">[]): string {
  const n = liste.filter((x) => x.active).length;
  return n === 0 ? t("planche.sb.extensions.aucune") : n === 1 ? t("planche.sb.extensions.active") : t("planche.sb.extensions.actives", { n: String(n) });
}

type Section = "ouvrir" | "exporter" | "importer" | null;
type Volet = "nouvelle" | "renommer" | "copier" | "supprimer" | null;

/** Nom affiché d'une Planche : le nom choisi, sinon le nom par défaut du brouillon d'origine. */
export const nomAffiche = (p: InfoPlanche): string => (p.nom !== "" ? p.nom : t("planche.sb.defaut"));

/**
 * `deplacable` : au téléphone, carte flottante qu'un appui de 2 s rend déplaçable (comme avant) ; à l'ordinateur, le
 * pictogramme occupe le carré gauche du bandeau d'en-tête de la Planche et ne se déplace pas (le menu s'ouvre dessous).
 */
export function MenuPlanche({ planches, courante, etat, actions, extensions, deplacable = true }: { planches: readonly InfoPlanche[]; courante: InfoPlanche; etat: EtatSauvegarde; actions: ActionsMenuPlanche; extensions?: ExtensionsMenu; deplacable?: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const [section, setSection] = useState<Section>(null);
  const [volet, setVolet] = useState<Volet>(null);
  const [nom, setNom] = useState("");
  const [altitude, setAltitude] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [unite, setUnite] = useState<UniteFichier>("m");
  const [occupe, setOccupe] = useState(false);
  const [infos, setInfos] = useState<InformationsPlanche | null>(null);
  const [fenetreExtensions, setFenetreExtensions] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const fichierRef = useRef<HTMLInputElement | null>(null);
  const formatImportRef = useRef<FormatEchange>("ifc");
  const infosOuvertes = infos !== null;

  // Pictogramme seul, flottant : un clic déroule le menu ; un appui maintenu 2 s le rend déplaçable.
  const [pos, setPos] = useState<PositionMenu | null>(() => lirePositionMenu(stockageLocal()));
  const [enDeplacement, setEnDeplacement] = useState(false);
  const [cote, setCote] = useState<{ horizontal: "gauche" | "droite"; vertical: "bas" | "haut" }>({ horizontal: "gauche", vertical: "bas" });
  const appui = useRef<{ px: number; py: number; x: number; y: number; minuteur: number | null; actif: boolean } | null>(null);
  const clicIgnore = useRef(false);
  const mesures = () => {
    const el = ref.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return null;
    return { el, taille: { largeur: el.offsetWidth, hauteur: el.offsetHeight }, zone: { largeur: parent.clientWidth, hauteur: parent.clientHeight }, x: el.offsetLeft, y: el.offsetTop };
  };
  const finAppui = (valider: boolean) => {
    const a = appui.current;
    appui.current = null;
    if (!a) return;
    if (a.minuteur !== null) window.clearTimeout(a.minuteur);
    if (!a.actif) return;
    setEnDeplacement(false);
    clicIgnore.current = true;
    window.setTimeout(() => (clicIgnore.current = false), 400);
    if (valider) {
      const m = mesures();
      if (m) ecrirePositionMenu(stockageLocal(), { x: m.x, y: m.y });
    }
  };
  const surAppui = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!deplacable) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const m = mesures();
    if (!m) return;
    finAppui(false);
    const a = { px: e.clientX, py: e.clientY, x: m.x, y: m.y, minuteur: null as number | null, actif: false };
    a.minuteur = window.setTimeout(() => {
      a.minuteur = null;
      a.actif = true;
      setEnDeplacement(true);
      setOuvert(false);
      setSection(null);
      setVolet(null);
      setInfos(null);
      setFenetreExtensions(false);
      setPos({ x: a.x, y: a.y });
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(30);
    }, DELAI_APPUI_MS);
    appui.current = a;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointeur déjà relâché */
    }
  };
  const surMouvement = (e: React.PointerEvent<HTMLButtonElement>) => {
    const a = appui.current;
    if (!a) return;
    const dx = e.clientX - a.px;
    const dy = e.clientY - a.py;
    if (!a.actif) {
      // Le doigt ou la souris bouge avant les 2 s : ce n'est pas une demande de déplacement.
      if (Math.hypot(dx, dy) > SEUIL_MOUVEMENT_PX) {
        if (a.minuteur !== null) window.clearTimeout(a.minuteur);
        appui.current = null;
      }
      return;
    }
    const m = mesures();
    if (m) setPos(bornerPosition({ x: a.x + dx, y: a.y + dy }, m.taille, m.zone));
  };
  const surClavier = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!deplacable || !e.altKey) return;
    const pas = e.shiftKey ? 32 : 8;
    const d = e.key === "ArrowLeft" ? [-pas, 0] : e.key === "ArrowRight" ? [pas, 0] : e.key === "ArrowUp" ? [0, -pas] : e.key === "ArrowDown" ? [0, pas] : null;
    const m = mesures();
    if (!d || !m) return;
    e.preventDefault();
    e.stopPropagation();
    const n = bornerPosition({ x: m.x + d[0]!, y: m.y + d[1]! }, m.taille, m.zone);
    setPos(n);
    ecrirePositionMenu(stockageLocal(), n);
  };
  const basculerMenu = () => {
    if (clicIgnore.current) return;
    if (ouvert) return fermer();
    const m = deplacable ? mesures() : null;
    if (!deplacable) setCote({ horizontal: "gauche", vertical: "bas" });
    if (m) setCote(coteOuverture({ x: m.x, y: m.y }, m.taille, m.zone));
    setOuvert(true);
  };
  useEffect(() => {
    if (pos === null || !deplacable) return;
    const w = ref.current?.ownerDocument.defaultView ?? window;
    const replacer = () => {
      const m = mesures();
      if (m) setPos((p) => (p ? bornerPosition(p, m.taille, m.zone) : p));
    };
    w.addEventListener("resize", replacer);
    return () => w.removeEventListener("resize", replacer);
  }, [pos === null, deplacable]);
  useEffect(() => () => finAppui(false), []);

  const fermer = () => {
    setOuvert(false);
    setSection(null);
    setVolet(null);
    setErreur(null);
    setInfos(null);
    setFenetreExtensions(false);
  };
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) fermer();
    };
    const clavier = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (infosOuvertes) setInfos(null);
      else if (volet) setVolet(null);
      else if (fenetreExtensions) setFenetreExtensions(false);
      else fermer();
    };
    // Fenêtre où vit le menu (page ou Planche détachée).
    const w = ref.current?.ownerDocument.defaultView ?? window;
    w.addEventListener("pointerdown", dehors, true);
    w.addEventListener("keydown", clavier, true);
    return () => {
      w.removeEventListener("pointerdown", dehors, true);
      w.removeEventListener("keydown", clavier, true);
    };
  }, [ouvert, volet, infosOuvertes, fenetreExtensions]);

  const executer = async (fn: () => Promise<void>, fermerApres = true) => {
    setOccupe(true);
    try {
      await fn();
      if (fermerApres) fermer();
    } finally {
      setOccupe(false);
    }
  };
  const ouvrirVolet = (v: Exclude<Volet, null>) => {
    setErreur(null);
    setVolet(v);
    if (v === "nouvelle") {
      setNom(t("planche.sb.nom-defaut", { numero: String(planches.length + 1) }));
      setAltitude("");
    } else if (v === "renommer") {
      setNom(nomAffiche(courante));
      setAltitude(courante.altitudeRef === null ? "" : String(courante.altitudeRef).replace(".", LANGUE_INTERFACE === "en" ? "." : ","));
    } else if (v === "copier") {
      setNom(`${nomAffiche(courante)} (${LANGUE_INTERFACE === "en" ? "copy" : "copie"})`);
    }
  };
  const ouvrirExtensions = () => {
    setVolet(null);
    setSection(null);
    setFenetreExtensions(true);
  };
  const ouvrirInformations = () => {
    setVolet(null);
    setSection(null);
    setInfos(actions.informations());
  };
  const validerVolet = (e: React.FormEvent) => {
    e.preventDefault();
    if (volet === "supprimer") return void executer(() => actions.supprimer());
    const n = nomValide(nom);
    if (n === null) return setErreur(t("planche.sb.nom.invalide"));
    const alt = altitudeSaisie(altitude);
    if ((volet === "nouvelle" || volet === "renommer") && alt === undefined) return setErreur(t("planche.sb.niveau.invalide"));
    if (volet === "nouvelle") void executer(() => actions.creer(n, alt as number | null));
    else if (volet === "renommer") void executer(() => actions.renommer(n, alt as number | null));
    else if (volet === "copier") void executer(() => actions.enregistrerSous(n));
  };
  const choisirFichier = (format: FormatEchange) => {
    formatImportRef.current = format;
    const champ = fichierRef.current;
    if (!champ) return;
    champ.accept = ACCEPT[format];
    champ.value = "";
    champ.click();
  };
  const basculer = (s: Exclude<Section, null>) => {
    setVolet(null);
    setSection(section === s ? null : s);
  };
  const item = (cle: string, icone: Parameters<typeof IconeSandbox>[0]["nom"], libelle: string, onClick: () => void, options: { desactive?: boolean; etendu?: boolean; pastille?: string } = {}) => (
    <li role="none">
      <button type="button" role="menuitem" disabled={options.desactive || occupe} aria-haspopup={options.pastille !== undefined ? "dialog" : options.etendu === undefined ? undefined : "true"} aria-expanded={options.etendu} onClick={onClick} data-planche-menu-item={cle}>
        <span className="planche-menu-item-libelle"><IconeSandbox nom={icone} className="planche-menu-item-icone" />{libelle}</span>
        {options.pastille !== undefined && <span className="planche-menu-pastille" data-planche-extensions-pastille>{options.pastille}</span>}
        {options.etendu !== undefined && <IconeSandbox nom={options.etendu ? "menu" : "sousMenu"} className="planche-menu-item-chevron" />}
      </button>
    </li>
  );
  const titre = nomAffiche(courante);
  const place = deplacable ? pos : null;
  return (
    <div
      className={`planche-menu-principal${place ? " est-deplace" : ""}${enDeplacement ? " en-deplacement" : ""}${deplacable ? "" : " dans-bandeau"}`}
      ref={ref}
      style={place ? { left: `${place.x}px`, top: `${place.y}px` } : undefined}
      data-planche-menu-principal
      data-planche-menu-deplacable={deplacable}
      data-cote-h={cote.horizontal}
      data-cote-v={cote.vertical}
    >
      <button
        type="button"
        className="outil planche-menu-bouton"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-label={`${t("planche.menu-principal")} — ${titre}`}
        title={deplacable ? `${t("planche.menu-principal")} — ${titre}\n${t("planche.sb.menu-deplacer")}` : `${t("planche.menu-principal")} — ${titre}`}
        onClick={basculerMenu}
        onPointerDown={surAppui}
        onPointerMove={surMouvement}
        onPointerUp={() => finAppui(true)}
        onPointerCancel={() => finAppui(true)}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={surClavier}
        data-planche-menu-ouvrir
        data-planche-nom={courante.nom}
      >
        <IconeSandbox nom="fichier" className="outil-picto" />
      </button>
      <input
        ref={fichierRef}
        type="file"
        hidden
        data-planche-importer-fichier
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void executer(() => actions.importer(formatImportRef.current, f, unite));
        }}
      />
      {ouvert && fenetreExtensions && extensions && (
        <div className="planche-menu planche-menu-liste planche-extensions" role="dialog" aria-label={t("extensions.titre")} data-planche-extensions>
          <header className="planche-extensions-tete">
            <button type="button" className="planche-extensions-bouton" onClick={() => setFenetreExtensions(false)} aria-label={t("extensions.retour")} title={t("extensions.retour")} data-planche-extensions-retour>
              <IconeSandbox nom="menuRetour" />
            </button>
            <h3><IconeSandbox nom="menuExtensions" className="planche-menu-item-icone" />{t("extensions.titre")}</h3>
            <button type="button" className="planche-extensions-bouton" onClick={fermer} aria-label={t("extensions.fermer")} title={t("extensions.fermer")} data-planche-extensions-fermer>
              <IconeSandbox nom="fermer" />
            </button>
          </header>
          <p className="planche-extensions-aide">{t("extensions.aide")}</p>
          <ul className="planche-extensions-liste">
            {extensions.liste.map((x) => (
              <li key={x.id} className="planche-extension" data-planche-extension={x.id} data-planche-extension-active={x.active}>
                <span className="planche-extension-picto" aria-hidden="true"><Pictogramme picto={x.picto} /></span>
                <span className="planche-extension-texte">
                  <strong id={`planche-extension-${x.id}`}>{x.nom}</strong>
                  <span className="planche-extension-description">{x.description}</span>
                  <span className="planche-extension-contenu">{x.contenu}</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  className="planche-extension-interrupteur"
                  aria-checked={x.active}
                  aria-labelledby={`planche-extension-${x.id}`}
                  title={`${x.nom} — ${t(x.active ? "extensions.etat.active" : "extensions.etat.inactive")}`}
                  onClick={() => extensions.basculer(x.id, !x.active)}
                  data-planche-extension-interrupteur={x.id}
                />
              </li>
            ))}
          </ul>
          <p className="planche-extensions-pied" role="status" data-planche-extensions-etat={extensions.enAttente ? "attente" : "compte"}>{t(extensions.enAttente ? "extensions.copie" : "extensions.compte")}</p>
        </div>
      )}
      {ouvert && !(fenetreExtensions && extensions) && (
        <div className="planche-menu planche-menu-liste" role="menu" aria-label={t("planche.menu-principal")}>
          <ul role="none">
            {item("ouvrir", "menuOuvrir", t("planche.sb.ouvrir"), () => basculer("ouvrir"), { etendu: section === "ouvrir" })}
            {section === "ouvrir" && (
              <li role="none" className="planche-menu-sous-liste">
                <p className="inspecteur-aide">{t("planche.sb.ouvrir.aide")}</p>
                <ul role="none">
                  {planches.map((p) => (
                    <li key={p.id} role="none">
                      <button type="button" role="menuitemradio" aria-checked={p.id === courante.id} disabled={occupe} data-planche-ouvrir={p.id} onClick={() => void executer(() => actions.ouvrir(p.id))}>
                        {nomAffiche(p)}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            )}
            {item("nouvelle", "menuNouvelle", t("planche.sb.nouvelle"), () => ouvrirVolet("nouvelle"))}

            <li role="none" className="avec-separateur" aria-hidden="true" />
            {item("enregistrer", "menuEnregistrer", t("planche.sb.enregistrer"), () => void executer(() => actions.enregistrer()))}
            {item("enregistrer-sous", "menuEnregistrerSous", t("planche.sb.enregistrer-sous"), () => ouvrirVolet("copier"))}
            {item("renommer", "menuRenommer", t("planche.sb.renommer"), () => ouvrirVolet("renommer"))}

            <li role="none" className="avec-separateur" aria-hidden="true" />
            {item("supprimer", "menuSupprimer", t("planche.sb.supprimer"), () => ouvrirVolet("supprimer"))}

            <li role="none" className="avec-separateur" aria-hidden="true" />
            {item("partager", "menuPartager", t("planche.sb.partager"), () => void executer(() => actions.partager()))}
            {item("partager-lien", "menuLienConsultation", t("planche.sb.partager-lien"), () => void executer(() => actions.liensConsultation()))}
            {item("exporter", "menuExporter", t("planche.sb.exporter"), () => basculer("exporter"), { etendu: section === "exporter" })}
            {section === "exporter" && (
              <li role="none" className="planche-menu-sous-liste">
                <ul role="none">
                  {FORMATS_ECHANGE.map((f) => (
                    <li key={f} role="none">
                      <button type="button" role="menuitem" disabled={occupe} data-planche-exporter={f} onClick={() => void executer(() => actions.exporter(f))}>{t("planche.sb.format-exporter", { format: f.toUpperCase() })}</button>
                    </li>
                  ))}
                </ul>
              </li>
            )}
            {item("importer", "menuImporter", t("planche.sb.importer"), () => basculer("importer"), { etendu: section === "importer" })}
            {section === "importer" && (
              <li role="none" className="planche-menu-sous-liste">
                <label className="planche-menu-unite">
                  {t("planche.sb.unite")}
                  <select value={unite} onChange={(e) => setUnite(e.target.value as UniteFichier)} data-planche-importer-unite>
                    {(["m", "cm", "mm"] as const).map((u) => <option key={u} value={u}>{t(`planche.sb.unite.${u}`)}</option>)}
                  </select>
                </label>
                <ul role="none">
                  {FORMATS_ECHANGE.map((f) => (
                    <li key={f} role="none">
                      <button type="button" role="menuitem" disabled={occupe} data-planche-importer={f} onClick={() => choisirFichier(f)}>{t("planche.sb.format-importer", { format: f.toUpperCase() })}</button>
                    </li>
                  ))}
                </ul>
              </li>
            )}
            {item("importer-fond", "menuImporterFond", t("planche.sb.importer-fond"), () => void executer(() => actions.importerFond()))}

            <li role="none" className="avec-separateur" aria-hidden="true" />
            {item("informations", "menuInformations", t("planche.sb.informations"), ouvrirInformations)}
            {item("png", "menuImage", t("planche.telecharger-png"), () => void executer(() => actions.telechargerPng()))}

            <li role="none" className="avec-separateur" aria-hidden="true" />
            {item("extensions", "menuExtensions", t("planche.sb.extensions"), ouvrirExtensions, { desactive: !extensions, pastille: extensions ? pastilleExtensions(extensions.liste) : "" })}
          </ul>
          {volet && (
            <form className="planche-menu-volet" data-planche-menu-volet={volet} onSubmit={validerVolet}>
              {volet === "supprimer" ? (
                <p>{t("planche.sb.supprimer.confirmer", { nom: titre })}</p>
              ) : (
                <label>
                  {t("planche.nom")}
                  <input value={nom} autoFocus onChange={(e) => setNom(e.target.value)} autoComplete="off" maxLength={80} data-planche-volet-nom />
                </label>
              )}
              {(volet === "nouvelle" || volet === "renommer") && (
                <label>
                  {t("planche.sb.niveau")}
                  <input value={altitude} inputMode="decimal" onChange={(e) => setAltitude(e.target.value)} autoComplete="off" data-planche-volet-niveau />
                  <small className="inspecteur-aide">{t("planche.sb.niveau.aide")}</small>
                </label>
              )}
              {erreur && <p role="alert" className="planche-menu-erreur" data-planche-volet-erreur>{erreur}</p>}
              <div className="barre-groupe">
                <button type="submit" disabled={occupe} data-planche-volet-valider>{volet === "supprimer" ? t("planche.sb.supprimer") : volet === "nouvelle" ? t("planche.sb.creer") : t("planche.sb.valider")}</button>
                <button type="button" onClick={() => setVolet(null)} data-planche-volet-annuler>{t("planche.sb.annuler")}</button>
              </div>
            </form>
          )}
        </div>
      )}
      {infos && (
        <InformationsPlancheVue
          info={courante}
          total={planches.length}
          stats={infos}
          etat={etat}
          nomAffiche={titre}
          onFermer={() => setInfos(null)}
          onRenommer={() => { setInfos(null); ouvrirVolet("renommer"); }}
          onInspecter={() => setInfos(actions.informations())}
          onHistorique={() => setInfos(actions.informations())}
          onEnregistrer={() => void executer(() => actions.enregistrer(), false).then(() => setInfos(actions.informations()))}
          onPartager={() => void executer(() => actions.partager(), false)}
          onSupprimer={() => { setInfos(null); ouvrirVolet("supprimer"); }}
        />
      )}
    </div>
  );
}
