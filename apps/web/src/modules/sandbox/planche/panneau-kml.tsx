/**
 * Panneau de l'étape 7b du lot C4 (cas 4 du catalogue des extensions : D10-R-003) : « KML / KMZ ». Fichier lu
 * (polygones, lignes, points, ce qui n'est pas lu), système du projet et sa définition (connue de Fadi ou .prj fourni),
 * import à plat par le point de base : polygones en faces, lignes en guides, points en points de guide étiquetés.
 */
import { t } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_KML, type Disponibilite, type IdCommandeKml } from "./commandes-objets";
import { afficherRaccourci } from "./outils-planche";

export interface ResumeKml {
  readonly nom: string;
  readonly polygones: number;
  readonly lignes: number;
  readonly points: number;
  readonly omis: readonly string[];
}

function Bouton({ id, executer, disponibilite, principal = false }: { id: IdCommandeKml; executer: (id: IdCommandeKml) => void; disponibilite: (id: IdCommandeKml) => Disponibilite; principal?: boolean }) {
  const c = COMMANDES_KML.find((x) => x.id === id)!;
  const d = disponibilite(id);
  return (
    <button type="button" className={principal ? "est-principal" : undefined} disabled={!d.disponible} title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`} aria-label={t(c.libelle)} onClick={() => executer(id)} data-planche-commande={id}>
      <Pictogramme picto={c.picto} /> {t(c.court)} ({afficherRaccourci(c.raccourci)})
    </button>
  );
}

export function PanneauKml({
  lu,
  systeme,
  prj,
  executer,
  disponibilite,
  onChoisirFichier,
  erreur,
  note,
}: {
  lu: ResumeKml | null;
  /** Système du point de base, ou null sans point de base. */
  systeme: string | null;
  /** Nom du .prj fourni, ou null. */
  prj: string | null;
  executer: (id: IdCommandeKml) => void;
  disponibilite: (id: IdCommandeKml) => Disponibilite;
  onChoisirFichier: () => void;
  erreur: string | null;
  note: string | null;
}) {
  return (
    <div className="planche-controle planche-fonds planche-ifc" data-planche-kml={lu ? lu.polygones + lu.lignes + lu.points : ""}>
      <p className="inspecteur-aide" data-planche-kml-lu>{lu ? t("planche.kml.lu", { nom: lu.nom, polygones: String(lu.polygones), lignes: String(lu.lignes), points: String(lu.points) }) : t("planche.kml.aucun")}</p>
      <div className="planche-debit-barre">
        <button type="button" onClick={onChoisirFichier} data-planche-kml-choisir>
          {t("planche.kml.choisir")}
        </button>
      </div>
      <dl className="planche-dxf-calques">
        <div>
          <dt>{t("planche.kml.systeme")}</dt>
          <dd data-planche-kml-systeme>{systeme ?? t("planche.kml.sans-point-de-base")}</dd>
        </div>
        <div>
          <dt>{t("planche.kml.definition")}</dt>
          <dd data-planche-kml-definition>{prj ? t("planche.kml.definition.prj", { nom: prj }) : t("planche.kml.definition.fadi")}</dd>
        </div>
      </dl>
      {lu && lu.omis.length > 0 && <p className="inspecteur-aide" data-planche-kml-omis>{t("planche.kml.omis", { liste: lu.omis.join(", ") })}</p>}
      <p className="inspecteur-aide">{t("planche.kml.aide")}</p>
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.kml.barre")}>
        <Bouton id="importer-kml" executer={executer} disponibilite={disponibilite} principal />
        <Bouton id="definition-systeme" executer={executer} disponibilite={disponibilite} />
      </div>
      {erreur && <p className="planche-message" role="alert" data-planche-kml-erreur>{erreur}</p>}
      {note && <p className="inspecteur-aide" data-planche-kml-note>{note}</p>}
    </div>
  );
}
