/**
 * Panneaux de l'étape 5 du lot C4 (cas 4 du catalogue des extensions : D10-F14-005, D10-F14-143, D10-F14-123 ; maquette
 * `analyses/catalogue-extensions/cas-4/maquettes/c4-etape-5-dxf.png`) :
 * - « Feuilles en DXF » : feuilles cochées, contenu de chaque fichier (feuille entière en millimètres papier, ou chaque vue
 *   en mètres à l'échelle réelle), calques normalisés, export (un fichier DXF R2000 par feuille ou par vue) ;
 * - « Statut des travaux » : Existant, À démolir, Projeté sur la sélection, filtre d'affichage, couleurs, compte.
 */
import { CALQUES_DXF, type Feuille, type Id, type StatutTravaux } from "@parcours/sandbox-planche-model";
import { LOCALE } from "../../../lib/i18n";
import { t, type CleMessage } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_DXF, COMMANDES_TRAVAUX, type Disponibilite, type IdCommandeDxf, type IdCommandeTravaux } from "./commandes-objets";
import { afficherRaccourci } from "./outils-planche";

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();

export type ContenuDxf = "feuille" | "vues";

/** Ligne de droite d'une feuille : format A et échelles de ses fenêtres (« A1 · 1:100 · 1:50 »). */
export function resumeFeuilleDxf(f: Feuille): string {
  const echelles = [...new Set(f.fenetres.map((w) => w.echelle))].sort((a, b) => b - a);
  return [`A${f.format}`, ...echelles.map((e) => `1:${e}`)].join(" · ");
}

export function PanneauFeuillesDxf({
  feuilles,
  cochees,
  onCocher,
  contenu,
  onContenu,
  executer,
  disponibilite,
  erreur,
  note,
}: {
  feuilles: readonly Feuille[];
  cochees: ReadonlySet<Id>;
  onCocher: (id: Id, coche: boolean) => void;
  contenu: ContenuDxf;
  onContenu: (c: ContenuDxf) => void;
  executer: (id: IdCommandeDxf) => void;
  disponibilite: (id: IdCommandeDxf) => Disponibilite;
  erreur: string | null;
  note: string | null;
}) {
  const c = COMMANDES_DXF.find((x) => x.id === "exporter-dxf")!;
  const d = disponibilite("exporter-dxf");
  return (
    <div className="planche-controle planche-fonds planche-dxf" data-planche-dxf={feuilles.length}>
      <p className="inspecteur-aide">{t("planche.dxf.intro")}</p>
      {feuilles.length === 0 ? (
        <p className="inspecteur-aide" data-planche-dxf-vide>{t("planche.dxf.vide")}</p>
      ) : (
        <ul className="planche-fonds-liste planche-dxf-liste">
          {feuilles.map((f) => (
            <li key={f.id} data-planche-dxf-feuille={f.numero}>
              <label>
                <input type="checkbox" checked={cochees.has(f.id)} onKeyDown={arreter} onChange={(e) => onCocher(f.id, e.target.checked)} data-planche-dxf-coche={f.numero} />
                <b>{`${f.numero} ${f.nom}`}</b>
                <small>{resumeFeuilleDxf(f)}</small>
              </label>
            </li>
          ))}
        </ul>
      )}
      <fieldset className="planche-dxf-contenu">
        <legend>{t("planche.dxf.contenu")}</legend>
        {(["feuille", "vues"] as const).map((v) => (
          <label key={v}>
            <input type="radio" name="planche-dxf-contenu" checked={contenu === v} onKeyDown={arreter} onChange={() => onContenu(v)} data-planche-dxf-contenu={v} /> {t(`planche.dxf.contenu.${v}` as CleMessage)}
          </label>
        ))}
      </fieldset>
      <dl className="planche-dxf-calques" data-planche-dxf-calques={CALQUES_DXF.length}>
        {CALQUES_DXF.map((k) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{t(`planche.dxf.calque.${k}` as CleMessage)}</dd>
          </div>
        ))}
        <div>
          <dt>…_EXISTANT</dt>
          <dd>{t("planche.dxf.calque.statut")}</dd>
        </div>
      </dl>
      <p className="inspecteur-aide">{t("planche.dxf.aide")}</p>
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.dxf.barre")}>
        <button type="button" className="est-principal" disabled={!d.disponible} title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`} aria-label={t(c.libelle)} onClick={() => executer("exporter-dxf")} data-planche-commande="exporter-dxf">
          <Pictogramme picto={c.picto} /> {t("planche.dxf.exporter", { nombre: String(cochees.size) })} ({afficherRaccourci(c.raccourci)})
        </button>
      </div>
      {erreur && <p className="planche-message" role="alert" data-planche-dxf-erreur>{erreur}</p>}
      {note && <p className="inspecteur-aide" data-planche-dxf-note>{note}</p>}
    </div>
  );
}

const COMMANDE_DU_STATUT: Readonly<Record<StatutTravaux, IdCommandeTravaux>> = { existant: "statut-existant", "a-demolir": "statut-a-demolir", projete: "statut-projete" };

export function PanneauStatutTravaux({
  objets,
  statutCommun,
  compte,
  etat,
  onEtat,
  couleurs,
  onCouleur,
  executer,
  disponibilite,
  note,
}: {
  objets: number;
  /** Statut partagé par toute la sélection (bouton enfoncé) ; `null` = aucun ou mélangés. */
  statutCommun: StatutTravaux | null;
  compte: Readonly<Record<StatutTravaux | "sans", number>>;
  etat: "tout" | "existant" | "projete";
  onEtat: (e: "tout" | "existant" | "projete") => void;
  couleurs: Readonly<Record<StatutTravaux, string>>;
  onCouleur: (s: StatutTravaux, couleur: string) => void;
  executer: (id: IdCommandeTravaux) => void;
  disponibilite: (id: IdCommandeTravaux) => Disponibilite;
  note: string | null;
}) {
  const n = (v: number) => v.toLocaleString(LOCALE);
  return (
    <div className="planche-controle planche-statut" data-planche-statut={statutCommun ?? ""}>
      <p className="inspecteur-aide">{objets > 0 ? t("planche.travaux.selection", { nombre: String(objets) }) : t("planche.travaux.selection-aucune")}</p>
      <div className="planche-statut-boutons" role="toolbar" aria-label={t("planche.travaux.barre")}>
        {(["existant", "a-demolir", "projete"] as const).map((s) => {
          const id = COMMANDE_DU_STATUT[s];
          const c = COMMANDES_TRAVAUX.find((x) => x.id === id)!;
          const d = disponibilite(id);
          const actif = statutCommun === s;
          return (
            <div key={s} className={`planche-statut-ligne${actif ? " est-actif" : ""}`}>
              <input type="color" className="planche-statut-couleur" value={couleurs[s]} aria-label={t("planche.travaux.couleur", { statut: t(`planche.travaux.court.${id}` as CleMessage) })} onKeyDown={arreter} onChange={(e) => onCouleur(s, e.target.value)} data-planche-statut-couleur={s} />
              <button type="button" aria-pressed={actif} disabled={!d.disponible} title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`} aria-label={t(c.libelle)} onClick={() => executer(id)} data-planche-commande={id}>
                <Pictogramme picto={c.picto} /> {t(c.court)} ({afficherRaccourci(c.raccourci)})
              </button>
            </div>
          );
        })}
      </div>
      <p className="planche-statut-titre"><b>{t("planche.travaux.afficher")}</b></p>
      <div className="planche-statut-filtre" role="radiogroup" aria-label={t("planche.travaux.afficher")}>
        {(["tout", "existant", "projete"] as const).map((e) => (
          <button key={e} type="button" role="radio" aria-checked={etat === e} className={etat === e ? "est-actif" : ""} onClick={() => onEtat(e)} data-planche-statut-etat={e}>
            {t(`planche.travaux.etat.${e}` as CleMessage)}
          </button>
        ))}
      </div>
      <p className="inspecteur-aide">{t("planche.travaux.aide")}</p>
      <p className="inspecteur-aide" data-planche-statut-compte={`${compte.existant}/${compte["a-demolir"]}/${compte.projete}/${compte.sans}`}>
        {t("planche.travaux.compte", { existant: n(compte.existant), demolir: n(compte["a-demolir"]), projete: n(compte.projete), sans: n(compte.sans) })}
      </p>
      {note && <p className="inspecteur-aide" data-planche-statut-note>{note}</p>}
    </div>
  );
}
