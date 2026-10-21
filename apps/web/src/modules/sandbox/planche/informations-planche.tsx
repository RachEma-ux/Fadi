/**
 * Page « Informations » de la Planche (menu de la Planche), dans le style de la page Informations d'Excel : à gauche
 * des cartes « bouton + titre + explication », à droite les propriétés (taille, nom, niveau, dates). Composant pur :
 * il reçoit les chiffres et les rappels ; la Planche exécute. Rien n'est inventé : chaque ligne est mesurée (contenu,
 * taille du document enregistré) ou déclarée par l'utilisateur (nom, niveau de référence).
 */
import { LANGUE_INTERFACE, t } from "../messages";
import { IconeSandbox } from "../pictogrammes/Pictogramme";
import { formaterDateJournal, type EntreeJournal } from "./journal-planche";
import type { InfoPlanche } from "./registre-planches";
import type { EtatSauvegarde } from "./sauvegarde-brouillon";

export interface InformationsPlanche {
  /** Taille du document enregistré (octets, UTF-8). */
  readonly octets: number;
  readonly objets: number;
  readonly faces: number;
  readonly aretes: number;
  readonly annotations: number;
  readonly aretesLibres: number;
  readonly nonEtanches: number;
  readonly pasAnnulables: number;
  /** Les 5 modifications les plus récentes, la plus récente d'abord. */
  readonly chronologie: readonly EntreeJournal[];
}

export function formaterTaille(octets: number, langue = LANGUE_INTERFACE): string {
  const unite = langue === "en" ? ["B", "KB", "MB"] : ["o", "Ko", "Mo"];
  if (octets < 1024) return `${octets} ${unite[0]}`;
  const x = octets / (octets < 1024 * 1024 ? 1024 : 1024 * 1024);
  return `${x.toFixed(x < 10 ? 1 : 0).replace(".", langue === "en" ? "." : ",")} ${unite[octets < 1024 * 1024 ? 1 : 2]}`;
}

const dateLocale = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(LANGUE_INTERFACE === "en" ? "en-GB" : "fr-FR", { dateStyle: "medium", timeStyle: "short" });
};

/** Lignes de l'inspection : seulement ce qui mérite d'être su avant un export (jamais une ligne vide). */
export function lignesInspection(i: InformationsPlanche): string[] {
  const l = [t("planche.sb.info.inspecter.contenu", { objets: String(i.objets), faces: String(i.faces), aretes: String(i.aretes) })];
  if (i.annotations > 0) l.push(t("planche.sb.info.inspecter.annotations", { n: String(i.annotations) }));
  if (i.aretesLibres > 0) l.push(t("planche.sb.info.inspecter.libres", { n: String(i.aretesLibres) }));
  if (i.nonEtanches > 0) l.push(t("planche.sb.info.inspecter.ouverts", { n: String(i.nonEtanches) }));
  if (l.length === 1) l.push(t("planche.sb.info.inspecter.rien"));
  return l;
}

interface Carte {
  readonly cle: string;
  readonly icone: Parameters<typeof IconeSandbox>[0]["nom"];
  readonly bouton: string;
  readonly titre: string;
  readonly corps: React.ReactNode;
  readonly action: () => void;
  readonly danger?: boolean;
}

export function InformationsPlancheVue({ info, total, stats, etat, nomAffiche, onFermer, onRenommer, onInspecter, onHistorique, onEnregistrer, onPartager, onSupprimer }: {
  info: InfoPlanche;
  total: number;
  stats: InformationsPlanche;
  etat: EtatSauvegarde;
  nomAffiche: string;
  onFermer(): void;
  onRenommer(): void;
  onInspecter(): void;
  onHistorique(): void;
  onEnregistrer(): void;
  onPartager(): void;
  onSupprimer(): void;
}) {
  const cartes: Carte[] = [
    { cle: "nom", icone: "menuRenommer", bouton: t("planche.sb.info.nom.bouton"), titre: t("planche.sb.info.nom.titre"), corps: <p>{t("planche.sb.info.nom.texte")}</p>, action: onRenommer },
    {
      cle: "inspecter",
      icone: "menuInformations",
      bouton: t("planche.sb.info.inspecter.bouton"),
      titre: t("planche.sb.info.inspecter.titre"),
      corps: (
        <>
          <p>{t("planche.sb.info.inspecter.texte")}</p>
          <ul>{lignesInspection(stats).map((x) => <li key={x}>{x}</li>)}</ul>
        </>
      ),
      action: onInspecter,
    },
    {
      cle: "historique",
      icone: "menuHistorique",
      bouton: t("planche.sb.info.historique.bouton"),
      titre: t("planche.sb.info.historique.titre"),
      corps:
        stats.chronologie.length === 0 ? (
          <p>{t("planche.sb.info.historique.vide")}</p>
        ) : (
          <>
            <p>{t("planche.sb.info.historique.texte")}</p>
            <ol className="planche-info-chronologie">
              {stats.chronologie.slice(0, 5).map((e, i) => (
                <li key={`${e.a}-${i}`}>
                  <time dateTime={e.a}>{formaterDateJournal(e.a)}</time>, {e.auteur}, {e.description}
                </li>
              ))}
            </ol>
          </>
        ),
      action: onHistorique,
    },
    { cle: "gerer", icone: "menuEnregistrer", bouton: t("planche.sb.info.gerer.bouton"), titre: t("planche.sb.info.gerer.titre"), corps: <p>{t(`planche.sauvegarde.${etat}`)}</p>, action: onEnregistrer },
    { cle: "partager", icone: "menuPartager", bouton: t("planche.sb.info.partager.bouton"), titre: t("planche.sb.info.partager.titre"), corps: <p>{t("planche.sb.info.partager.texte")}</p>, action: onPartager },
    { cle: "supprimer", icone: "menuSupprimer", bouton: t("planche.sb.info.supprimer.titre"), titre: t("planche.sb.info.supprimer.titre"), corps: <p>{t("planche.sb.info.supprimer.texte")}</p>, action: onSupprimer, danger: true },
  ];
  return (
    <div className="planche-info" role="dialog" aria-modal="true" aria-label={t("planche.sb.info.titre")} data-planche-informations>
      <div className="planche-info-corps">
        <header className="planche-info-entete">
          <button type="button" className="planche-info-retour" onClick={onFermer} aria-label={t("planche.sb.info.retour")} title={t("planche.sb.info.retour")} data-planche-info-fermer>
            <IconeSandbox nom="menuRetour" />
          </button>
          <h2>{t("planche.sb.info.titre")}</h2>
        </header>
        <div className="planche-info-colonnes">
          <ul className="planche-info-cartes">
            {cartes.map((c) => (
              <li key={c.cle} className="planche-info-carte" data-planche-info-carte={c.cle}>
                <button type="button" className={`planche-info-bouton${c.danger ? " est-danger" : ""}`} onClick={c.action} data-planche-info-action={c.cle}>
                  <IconeSandbox nom={c.icone} className="planche-info-icone" />
                  <span>{c.bouton}</span>
                </button>
                <div className="planche-info-texte">
                  <h3>{c.titre}</h3>
                  {c.corps}
                </div>
              </li>
            ))}
          </ul>
          <aside className="planche-info-proprietes" aria-label={t("planche.sb.info.proprietes")}>
            <h3>{t("planche.sb.info.proprietes")}</h3>
            <dl>
              <dt>{t("planche.sb.info.taille")}</dt><dd>{formaterTaille(stats.octets)}</dd>
              <dt>{t("planche.sb.info.nom")}</dt><dd>{nomAffiche}</dd>
              <dt>{t("planche.sb.info.niveau")}</dt><dd>{info.altitudeRef === null ? t("planche.sb.info.niveau.aucun") : `${String(info.altitudeRef).replace(".", LANGUE_INTERFACE === "en" ? "." : ",")} m`}</dd>
              <dt>{t("planche.sb.info.contenu")}</dt><dd>{t("planche.sb.info.inspecter.contenu", { objets: String(stats.objets), faces: String(stats.faces), aretes: String(stats.aretes) })}</dd>
              <dt>{t("planche.sb.info.annulables")}</dt><dd>{stats.pasAnnulables}</dd>
            </dl>
            <h3>{t("planche.sb.info.dates")}</h3>
            <dl>
              <dt>{t("planche.sb.info.modifiee")}</dt><dd>{dateLocale(info.modifieA)}</dd>
              <dt>{t("planche.sb.info.creee")}</dt><dd>{dateLocale(info.creeA)}</dd>
            </dl>
            <h3>{t("planche.sb.info.stockage")}</h3>
            <dl>
              <dt>{t("planche.sb.info.stockage")}</dt><dd>{t("planche.sb.info.stockage.valeur")}</dd>
              <dt>{t("planche.sb.info.nombre")}</dt><dd>{total}</dd>
            </dl>
          </aside>
        </div>
      </div>
    </div>
  );
}
