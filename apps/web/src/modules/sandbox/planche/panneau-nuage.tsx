/**
 * Panneau de l'étape 7f du lot C4 (cas 4 du catalogue des extensions : D10-F23a-009) : « Nuage de points ». Relevé posé
 * en référence verrouillée ; tranche horizontale (altitude, épaisseur) et boîte de découpe réglée par ses poignées dans
 * la vue ; accrochage aux points mesurés ; plan ajusté aux points choisis (maquette validée).
 */
import type { ReactNode } from "react";
import { t } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_NUAGE, type Disponibilite, type IdCommandeNuage } from "./commandes-objets";
import { afficherRaccourci } from "./outils-planche";

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();

export interface FicheNuage {
  readonly fichier: string;
  readonly points: string;
  readonly unite: string;
}

export function PanneauNuage({
  fiche,
  etat,
  altitude,
  onAltitude,
  epaisseur,
  onEpaisseur,
  boite,
  accrocher,
  onAccrocher,
  choisis,
  resultat,
  erreur,
  executer,
  disponibilite,
  charger,
}: {
  /** Fiche du nuage posé, ou `null` sans nuage. */
  fiche: FicheNuage | null;
  /** Lecture du fichier archivé : en cours, introuvable, ou prête. */
  etat: "lecture" | "introuvable" | "pret";
  altitude: string;
  onAltitude: (v: string) => void;
  epaisseur: string;
  onEpaisseur: (v: string) => void;
  /** Texte de la boîte de découpe (dimensions et points de la tranche). */
  boite: string | null;
  accrocher: boolean;
  onAccrocher: (v: boolean) => void;
  choisis: number;
  resultat: string | null;
  erreur: string | null;
  executer: (id: IdCommandeNuage) => void;
  disponibilite: (id: IdCommandeNuage) => Disponibilite;
  /** Bouton « Charger une référence » (commande existante des références), montré sans nuage. */
  charger: ReactNode;
}) {
  const c = COMMANDES_NUAGE.find((x) => x.id === "ajuster-plan-nuage")!;
  const d = disponibilite("ajuster-plan-nuage");
  const touche = c.raccourci.split(",").pop()!.trim();
  return (
    <div className="planche-controle planche-fonds planche-ifc planche-visionneuse planche-nuage" data-planche-nuage>
      <p className="inspecteur-aide">{t("planche.nuage.aide")}</p>
      {!fiche ? (
        <>
          <p className="inspecteur-aide" data-planche-nuage-vide>{t("planche.nuage.vide")}</p>
          <div className="planche-debit-barre">{charger}</div>
        </>
      ) : (
        <>
          <dl className="planche-nuage-fiche" data-planche-nuage-fiche>
            <dt>{t("planche.nuage.fichier")}</dt>
            <dd>{fiche.fichier}</dd>
            <dt>{t("planche.nuage.points")}</dt>
            <dd data-planche-nuage-points>{fiche.points}</dd>
            <dt>{t("planche.nuage.unite")}</dt>
            <dd>{fiche.unite}</dd>
          </dl>
          {etat !== "pret" && <p className="inspecteur-aide" data-planche-nuage-etat={etat}>{t(etat === "lecture" ? "planche.nuage.lecture" : "planche.nuage.introuvable")}</p>}
          <p className="planche-statut-titre"><b>{t("planche.nuage.tranche")}</b></p>
          <div className="planche-nuage-tranche">
            <label>
              {t("planche.nuage.altitude")}
              <input type="text" inputMode="decimal" value={altitude} onKeyDown={arreter} onChange={(e) => onAltitude(e.target.value)} data-planche-nuage-altitude />
            </label>
            <label>
              {t("planche.nuage.epaisseur")}
              <input type="text" inputMode="decimal" value={epaisseur} onKeyDown={arreter} onChange={(e) => onEpaisseur(e.target.value)} data-planche-nuage-epaisseur />
            </label>
          </div>
          {boite && <p className="inspecteur-aide" data-planche-nuage-boite>{boite}</p>}
          <label className="planche-nuage-accrocher">
            <input type="checkbox" checked={accrocher} onKeyDown={arreter} onChange={(e) => onAccrocher(e.target.checked)} data-planche-nuage-accrocher /> {t("planche.nuage.accrocher")} <small>{t("planche.nuage.accrocher.aide")}</small>
          </label>
          <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.nuage.barre")}>
            <button
              type="button"
              disabled={!d.disponible}
              title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`}
              aria-label={t(c.libelle)}
              onClick={() => executer("ajuster-plan-nuage")}
              data-planche-commande="ajuster-plan-nuage"
            >
              <Pictogramme picto={c.picto} /> {t(c.court)} <kbd>{afficherRaccourci(touche)}</kbd>
            </button>
          </div>
          <p className="planche-nuage-resultat" data-planche-nuage-resultat={resultat ? "plan" : "choisis"}>{resultat ?? t("planche.nuage.choisis", { n: String(choisis) })}</p>
        </>
      )}
      {erreur && <p className="planche-message" role="alert" data-planche-nuage-erreur>{erreur}</p>}
      <p className="inspecteur-aide">{t("planche.nuage.formats")}</p>
    </div>
  );
}

/** Bulle « Boîte de découpe : poignées dans la vue », posée sur la vue (maquette validée). */
export function BulleNuage() {
  return <p className="planche-nuage-bulle" data-planche-nuage-bulle>{t("planche.nuage.bulle")}</p>;
}
