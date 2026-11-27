/**
 * Panneau « Emplacements Projets » de la carte GeoData (27 novembre 2026, à la demande du maître d'ouvrage) : le même
 * formulaire que l'Emplacement de la Planche — lieu, latitude, longitude, altitude, nord vrai — enregistré dans la base
 * (`geodata_emplacements`, API `/geodata/api/emplacements`), puis ouvert dans la Planche par son adresse
 * (`/sandbox?emplacement-geodata=<id>` : la Planche lit l'emplacement et le pose comme son Emplacement). Le centre de la
 * carte peut remplir latitude et longitude ; rien n'est deviné (altitude absente = non renseignée, jamais zéro).
 * L'adresse de la Planche est écrite en toutes lettres : aucun import du Sandbox (test d'indépendance).
 */
import { lireSaisieEmplacementGeoData, type ChampEmplacementGeoData, type EmplacementGeoData } from "@parcours/geodata-model";
import { useCallback, useEffect, useState } from "react";
import { api, ErreurGeoData, type EmplacementRecu } from "../client";

/** Libellé du bouton et du panneau, tel que demandé par le maître d'ouvrage. */
export const LIBELLE_EMPLACEMENTS = "Emplacements Projets";
/** Raccourci du bouton (Alt + lettre libre de la carte), contrôlé par test avec ceux des barres. */
export const RACCOURCI_EMPLACEMENTS = "Alt+J";
/** Icône propre : repère de localisation posé sur une équerre (plan de la Planche). */
export const ICONE_EMPLACEMENTS = "M12 13.5s4.5-4.2 4.5-7.7a4.5 4.5 0 0 0-9 0c0 3.5 4.5 7.7 4.5 7.7ZM12 4.3a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2ZM4 15v6h16M4 18h3M10 21v-3";
/** Adresse de la Planche qui ouvre un emplacement de GeoData (lue par la Planche du Sandbox). */
export const adressePlanche = (id: string) => `/sandbox?emplacement-geodata=${encodeURIComponent(id)}`;

const CHAMPS: readonly { cle: ChampEmplacementGeoData; libelle: string; decimal: boolean }[] = [
  { cle: "lieu", libelle: "Lieu (nom libre)", decimal: false },
  { cle: "latitude", libelle: "Latitude (°, nord positif)", decimal: true },
  { cle: "longitude", libelle: "Longitude (°, est positif)", decimal: true },
  { cle: "altitude", libelle: "Altitude (m, facultative)", decimal: true },
  { cle: "nord", libelle: "Nord vrai (° depuis l'axe vert, sens horaire)", decimal: true },
];
const ERREURS: Record<ChampEmplacementGeoData, string> = {
  lieu: "Lieu : un nom de 1 à 120 caractères.",
  latitude: "Latitude : un nombre de −90 à 90.",
  longitude: "Longitude : un nombre de −180 à 180.",
  altitude: "Altitude : un nombre, ou rien.",
  nord: "Nord : un angle en degrés, ou rien.",
};

type Saisie = Record<ChampEmplacementGeoData, string>;
const VIDE: Saisie = { lieu: "", latitude: "", longitude: "", altitude: "", nord: "" };
const texte = (n: number | null | undefined, decimales = 6): string => (n === null || n === undefined ? "" : String(Number(n.toFixed(decimales))).replace(".", ","));
const saisieDe = (e: EmplacementGeoData): Saisie => ({ lieu: e.lieu, latitude: texte(e.latitude), longitude: texte(e.longitude), altitude: texte(e.altitude, 2), nord: texte(e.nord, 2) });
const message = (e: unknown) => (e instanceof ErreurGeoData ? e.message : "Opération impossible.");
const coordonnees = (e: EmplacementGeoData) => `${texte(e.latitude)}° N, ${texte(e.longitude)}° E${e.altitude === null ? "" : ` · ${texte(e.altitude, 2)} m`} · nord ${texte(e.nord, 2)}°`;

export function PanneauEmplacements(p: {
  /** Centre actuel de la carte (WGS 84) ; `null` tant que la carte n'est pas prête. */
  centre(): { lon: number; lat: number } | null;
  onCentrer(e: { lon: number; lat: number }): void;
  onAnnonce(m: string): void;
}) {
  const [liste, setListe] = useState<EmplacementRecu[] | null>(null);
  const [erreurListe, setErreurListe] = useState<string | null>(null);
  const [saisie, setSaisie] = useState<Saisie>(VIDE);
  const [edite, setEdite] = useState<EmplacementRecu | null>(null);
  const [champFaux, setChampFaux] = useState<ChampEmplacementGeoData | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    setErreurListe(null);
    try { setListe((await api.emplacements()).emplacements); } catch (e) { setErreurListe(message(e)); }
  }, []);
  useEffect(() => { void charger(); }, [charger]);

  const nouveau = () => { setEdite(null); setSaisie(VIDE); setChampFaux(null); setErreur(null); };
  const remplirCentre = () => {
    const c = p.centre();
    if (!c) return;
    setSaisie((s) => ({ ...s, latitude: texte(c.lat), longitude: texte(c.lon) }));
  };
  const enregistrer = async () => {
    const r = lireSaisieEmplacementGeoData(saisie);
    if (!r.ok) { setChampFaux(r.champ); setErreur(ERREURS[r.champ]); return; }
    setChampFaux(null); setErreur(null); setEnCours(true);
    try {
      const e = edite ? await api.modifierEmplacement(edite.id, edite.revision, r.emplacement) : await api.creerEmplacement(r.emplacement);
      setEdite(e);
      setSaisie(saisieDe(e));
      p.onAnnonce(`Emplacement « ${e.lieu} » enregistré.`);
      await charger();
    } catch (e) { setErreur(message(e)); } finally { setEnCours(false); }
  };
  const retirer = async (e: EmplacementRecu) => {
    if (!window.confirm(`Retirer l'emplacement « ${e.lieu} » ? Une Planche qui l'a déjà ouvert garde sa copie.`)) return;
    setErreur(null);
    try {
      await api.supprimerEmplacement(e.id);
      if (edite?.id === e.id) nouveau();
      p.onAnnonce(`Emplacement « ${e.lieu} » retiré.`);
      await charger();
    } catch (x) { setErreur(message(x)); }
  };

  return (
    <div className="gd-emplacements" data-gd-emplacements>
      <p className="gd-discret">Saisissez la position d'un emplacement, enregistrez-le, puis ouvrez-le dans la Planche : il y devient son Emplacement (ombres, nord vrai).</p>
      <form className="gd-formulaire" onSubmit={(e) => { e.preventDefault(); void enregistrer(); }} data-gd-emplacement-formulaire={edite ? edite.id : "nouveau"}>
        {CHAMPS.map((c) => (
          <label key={c.cle} className="gd-champ">{c.libelle}
            <input value={saisie[c.cle]} inputMode={c.decimal ? "decimal" : "text"} maxLength={c.cle === "lieu" ? 120 : 32} aria-invalid={champFaux === c.cle}
              onChange={(e) => setSaisie({ ...saisie, [c.cle]: e.target.value })} data-gd-emplacement-champ={c.cle} />
          </label>
        ))}
        <div className="gd-actions">
          <button type="button" onClick={remplirCentre} disabled={!p.centre()} data-gd-emplacement-centre>Centre de la carte</button>
          <button type="submit" disabled={enCours} data-gd-emplacement-enregistrer>Enregistrer l'emplacement</button>
          {edite && <button type="button" onClick={nouveau} data-gd-emplacement-nouveau>Nouvel emplacement</button>}
        </div>
      </form>
      {erreur && <p role="alert" className="gd-alerte" data-gd-emplacement-erreur={champFaux ?? "serveur"}>{erreur}</p>}
      <h3>Emplacements enregistrés</h3>
      {erreurListe && <p role="alert" className="gd-alerte">{erreurListe} <button type="button" onClick={() => void charger()}>Réessayer</button></p>}
      {liste === null && !erreurListe && <p className="gd-etat" role="status">Chargement…</p>}
      {liste?.length === 0 && <p className="gd-etat">Aucun emplacement enregistré.</p>}
      <ul className="gd-liste">
        {liste?.map((e) => (
          <li key={e.id} className="gd-carte-couche" aria-current={edite?.id === e.id ? "true" : undefined} data-gd-emplacement={e.id}>
            <strong translate="no">{e.lieu}</strong>
            <p className="gd-discret" translate="no">{coordonnees(e)}</p>
            <div className="gd-actions">
              <a className="gd-bouton-lien" href={adressePlanche(e.id)} data-gd-emplacement-planche={e.id}>Ouvrir dans Planche</a>
              <button type="button" onClick={() => p.onCentrer({ lon: e.longitude, lat: e.latitude })}>Centrer</button>
              <button type="button" onClick={() => { setEdite(e); setSaisie(saisieDe(e)); setChampFaux(null); setErreur(null); }} data-gd-emplacement-modifier={e.id}>Modifier</button>
              <button type="button" onClick={() => void retirer(e)} data-gd-emplacement-retirer={e.id}>Retirer</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
