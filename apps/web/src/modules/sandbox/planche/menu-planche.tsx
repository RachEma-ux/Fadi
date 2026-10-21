/**
 * Menu de la Planche de Sandbox (pictogramme ☰ Tabler « menu-2 », MIT) : Ouvrir, Nouvelle, Enregistrer, Enregistrer
 * sous, Renommer / niveau de référence, Supprimer, Partager, Exporter et Importer (IFC, OBJ, STL), Informations
 * (page dans le style d'Excel) et PNG de la vue. Les Planches de Sandbox sont nommées mais locales à ce navigateur :
 * aucun projet, aucun serveur. Composant pur : il reçoit les Planches et des rappels ; la Planche exécute.
 */
import { useEffect, useRef, useState } from "react";
import { LANGUE_INTERFACE, t } from "../messages";
import { IconeSandbox } from "../pictogrammes/Pictogramme";
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
  creer(nom: string, altitude: number | null): Promise<void>;
  enregistrer(): Promise<void>;
  enregistrerSous(nom: string): Promise<void>;
  renommer(nom: string, altitude: number | null): Promise<void>;
  supprimer(): Promise<void>;
  partager(): Promise<void>;
  exporter(format: FormatEchange): Promise<void>;
  importer(format: FormatEchange, fichier: File, unite: UniteFichier): Promise<void>;
  telechargerPng(): Promise<void>;
  informations(): InformationsPlanche;
}

type Section = "ouvrir" | "exporter" | "importer" | null;
type Volet = "nouvelle" | "renommer" | "copier" | "supprimer" | null;

/** Nom affiché d'une Planche : le nom choisi, sinon le nom par défaut du brouillon d'origine. */
export const nomAffiche = (p: InfoPlanche): string => (p.nom !== "" ? p.nom : t("planche.sb.defaut"));

export function MenuPlanche({ planches, courante, etat, actions }: { planches: readonly InfoPlanche[]; courante: InfoPlanche; etat: EtatSauvegarde; actions: ActionsMenuPlanche }) {
  const [ouvert, setOuvert] = useState(false);
  const [section, setSection] = useState<Section>(null);
  const [volet, setVolet] = useState<Volet>(null);
  const [nom, setNom] = useState("");
  const [altitude, setAltitude] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [unite, setUnite] = useState<UniteFichier>("m");
  const [occupe, setOccupe] = useState(false);
  const [infos, setInfos] = useState<InformationsPlanche | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const fichierRef = useRef<HTMLInputElement | null>(null);
  const formatImportRef = useRef<FormatEchange>("ifc");
  const infosOuvertes = infos !== null;

  const fermer = () => {
    setOuvert(false);
    setSection(null);
    setVolet(null);
    setErreur(null);
    setInfos(null);
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
  }, [ouvert, volet, infosOuvertes]);

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
  const item = (cle: string, icone: Parameters<typeof IconeSandbox>[0]["nom"], libelle: string, onClick: () => void, options: { desactive?: boolean; etendu?: boolean } = {}) => (
    <li role="none">
      <button type="button" role="menuitem" disabled={options.desactive || occupe} aria-haspopup={options.etendu === undefined ? undefined : "true"} aria-expanded={options.etendu} onClick={onClick} data-planche-menu-item={cle}>
        <span className="planche-menu-item-libelle"><IconeSandbox nom={icone} className="planche-menu-item-icone" />{libelle}</span>
        {options.etendu !== undefined && <IconeSandbox nom={options.etendu ? "menu" : "sousMenu"} className="planche-menu-item-chevron" />}
      </button>
    </li>
  );
  const titre = nomAffiche(courante);
  return (
    <div className="planche-menu-principal" ref={ref} data-planche-menu-principal>
      <button type="button" className="planche-menu-bouton" aria-haspopup="menu" aria-expanded={ouvert} onClick={() => (ouvert ? fermer() : setOuvert(true))} title={`${t("planche.menu-principal")} — ${titre}`} data-planche-menu-ouvrir data-planche-nom={courante.nom}>
        <IconeSandbox nom="fichier" className="outil-picto" />
        <span className="planche-menu-titre">{titre}</span>
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
      {ouvert && (
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

            <li role="none" className="avec-separateur" aria-hidden="true" />
            {item("informations", "menuInformations", t("planche.sb.informations"), ouvrirInformations)}
            {item("png", "menuImage", t("planche.telecharger-png"), () => void executer(() => actions.telechargerPng()))}
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
          onEnregistrer={() => void executer(() => actions.enregistrer(), false).then(() => setInfos(actions.informations()))}
          onPartager={() => void executer(() => actions.partager(), false)}
          onSupprimer={() => { setInfos(null); ouvrirVolet("supprimer"); }}
        />
      )}
    </div>
  );
}
