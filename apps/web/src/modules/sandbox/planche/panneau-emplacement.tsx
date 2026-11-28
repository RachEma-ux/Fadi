/**
 * Panneau « Emplacement » (extension, 25 novembre 2026 ; d'après Add Location et Solar North de SketchUp) : la position
 * **saisie** de la Planche — lieu, latitude, longitude, altitude — et le nord vrai. Enregistrée avec la Planche, lue par
 * les ombres. Aucune carte, aucun terrain, aucune recherche d'adresse : ils demandent une source de données qualifiée.
 *
 * 27 novembre 2026 : section « Emplacements geoData » — les emplacements enregistrés dans GeoData (bouton « Emplacements
 * Projets » de la carte) se choisissent dans une liste et deviennent l'Emplacement de la Planche (un pas d'historique).
 */
import { type ChampEmplacement, type Emplacement, lireEmplacement } from "@parcours/sandbox-planche-model";
import { type ReactNode, useEffect, useState } from "react";
import { t } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_EMPLACEMENT, type Disponibilite, type IdCommandeEmplacement } from "./commandes-objets";
import { afficherRaccourci } from "./outils-planche";
import type { EmplacementGeoDataLu } from "./emplacements-geodata";

/** Emplacements de GeoData proposés à la Planche : liste lue à la demande, état de lecture, application. */
export interface EmplacementsGeoDataPanneau {
  readonly liste: readonly EmplacementGeoDataLu[] | null;
  readonly chargement: boolean;
  readonly erreur: string | null;
  onCharger(): void;
  onAppliquer(e: EmplacementGeoDataLu): void;
}

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();
const texte = (n: number | undefined): string => (n === undefined ? "" : String(n).replace(".", ","));
const saisieDe = (e: Emplacement | null) => ({ lieu: e?.lieu ?? "", latitude: texte(e?.latitude), longitude: texte(e?.longitude), altitude: texte(e?.altitude), nord: texte(e?.nord) });
// Cas 2, lot 5 (n° 5) : l'ancien champ « Altitude » disparaît ; le ±0,00 NGF unique se saisit dans sa section. La valeur
// déjà enregistrée (sites, GeoData) reste dans la saisie et se conserve.
const CHAMPS = ["lieu", "latitude", "longitude", "nord"] as const;

export function PanneauEmplacement({
  emplacement,
  lecture,
  flecheNord,
  onEnregistrer,
  executer,
  disponibilite,
  note,
  geodata,
  zero,
  systemes,
}: {
  emplacement: Emplacement | null;
  lecture: boolean;
  flecheNord: boolean;
  onEnregistrer: (e: Emplacement | null) => void;
  executer: (id: IdCommandeEmplacement) => void;
  disponibilite: (id: IdCommandeEmplacement) => Disponibilite;
  note: string | null;
  geodata: EmplacementsGeoDataPanneau;
  /** Cas 2, lot 5 : sections « ±0,00 du projet » (n° 5) et « Système de coordonnées et d'altitudes » (n° 92). */
  zero?: ReactNode;
  systemes?: ReactNode;
}) {
  const [choixGeoData, setChoixGeoData] = useState("");
  const choisi = geodata.liste?.find((g) => g.id === choixGeoData) ?? geodata.liste?.[0] ?? null;
  const [saisie, setSaisie] = useState(() => saisieDe(emplacement));
  const [erreur, setErreur] = useState<ChampEmplacement | null>(null);
  // L'emplacement a changé ailleurs (Annuler, nord aligné sur une arête) : la saisie le suit.
  useEffect(() => {
    setSaisie(saisieDe(emplacement));
    setErreur(null);
  }, [emplacement]);
  const enregistrer = () => {
    const r = lireEmplacement(saisie);
    if ("erreur" in r) {
      setErreur(r.erreur);
      return;
    }
    setErreur(null);
    // Le fuseau (lot 5, n° 105) se règle dans Ombres : l'enregistrement de la position le garde.
    onEnregistrer(emplacement?.fuseau ? { ...r.emplacement, fuseau: emplacement.fuseau } : r.emplacement);
  };
  return (
    <div className="planche-controle" data-planche-lieu={emplacement ? "renseigne" : "absent"}>
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.emplacement.barre")}>
        {COMMANDES_EMPLACEMENT.filter((c) => c.id !== "emplacement").map((c) => {
          const d = disponibilite(c.id);
          return (
            <button key={c.id} type="button" disabled={!d.disponible} aria-pressed={c.id === "afficher-nord" ? flecheNord : undefined} title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`} aria-label={t(c.libelle)} onClick={() => executer(c.id)} data-planche-commande={c.id}>
              <Pictogramme picto={c.picto} /> {t(c.court)}
            </button>
          );
        })}
      </div>
      <p className="inspecteur-aide">{t("planche.emplacement.aide")}</p>
      {!emplacement && <p className="inspecteur-aide" data-planche-lieu-absent>{t("planche.emplacement.absent")}</p>}
      <div className="planche-debit-reglages">
        {CHAMPS.map((c) => (
          <label key={c} className="planche-debit-champ">
            <span>{t(`planche.emplacement.${c}`)}</span>
            <input value={saisie[c]} disabled={lecture} inputMode={c === "lieu" ? "text" : "decimal"} aria-invalid={erreur === c} onKeyDown={(e) => { arreter(e); if (e.key === "Enter") enregistrer(); }} onChange={(e) => setSaisie({ ...saisie, [c]: e.target.value })} data-planche-lieu-champ={c} />
          </label>
        ))}
      </div>
      {erreur && <p className="inspecteur-aide" role="alert" data-planche-lieu-erreur={erreur}>{t(`planche.emplacement.erreur.${erreur}`)}</p>}
      <div className="planche-debit-barre">
        <button type="button" disabled={lecture} onClick={enregistrer} data-planche-lieu-enregistrer>{t("planche.emplacement.enregistrer")}</button>
        <button type="button" disabled={lecture || !emplacement} onClick={() => onEnregistrer(null)} data-planche-lieu-retirer>{t("planche.emplacement.retirer")}</button>
      </div>
      {zero}
      {systemes}
      <div className="planche-debit-reglages" data-planche-lieu-geodata={geodata.liste === null ? "non-lu" : String(geodata.liste.length)}>
        <p className="inspecteur-aide">{t("planche.emplacement.geodata.aide")}</p>
        {geodata.liste !== null && geodata.liste.length > 0 && (
          <label className="planche-debit-champ">
            <span>{t("planche.emplacement.geodata.liste")}</span>
            <select value={choisi?.id ?? ""} onChange={(e) => setChoixGeoData(e.target.value)} onKeyDown={arreter} data-planche-lieu-geodata-choix>
              {geodata.liste.map((g) => <option key={g.id} value={g.id} translate="no">{g.emplacement.lieu ?? `${texte(g.emplacement.latitude)} ; ${texte(g.emplacement.longitude)}`}</option>)}
            </select>
          </label>
        )}
        {geodata.liste !== null && geodata.liste.length === 0 && <p className="inspecteur-aide" data-planche-lieu-geodata-vide>{t("planche.emplacement.geodata.vide")}</p>}
        {geodata.erreur && <p className="inspecteur-aide" role="alert" data-planche-lieu-geodata-erreur>{geodata.erreur}</p>}
        <div className="planche-debit-barre">
          <button type="button" disabled={geodata.chargement} onClick={geodata.onCharger} data-planche-lieu-geodata-charger>{t(geodata.liste === null ? "planche.emplacement.geodata.charger" : "planche.emplacement.geodata.recharger")}</button>
          {geodata.liste !== null && geodata.liste.length > 0 && <button type="button" disabled={lecture || !choisi} onClick={() => choisi && geodata.onAppliquer(choisi)} data-planche-lieu-geodata-appliquer>{t("planche.emplacement.geodata.appliquer")}</button>}
        </div>
      </div>
      <p className="inspecteur-aide">{t("planche.emplacement.limites")}</p>
      {note && <p className="inspecteur-aide" role="status" data-planche-lieu-note>{note}</p>}
    </div>
  );
}
