/**
 * Paramètres → « Fournisseurs de fonds de carte » (D-GD-15) : saisir, modifier, désactiver ou supprimer les fournisseurs
 * dont GeoData propose les fonds, et choisir le fournisseur par défaut (MapTiler, intégré, par défaut). Tout reste dans
 * ce navigateur (stockage local) : ni les adresses ni les clés ne sont envoyées à l'API Fadi. La clé MapTiler est celle
 * de « Connexion MapTiler ».
 */
import { useEffect, useState, type FormEvent } from "react";
import { CLE_STOCKAGE_FOURNISSEURS, lireReglagesFournisseurs, validerFournisseurSaisi, type FournisseurCarte, type ReglagesFournisseurs } from "@parcours/geodata-model";
import { maptilerKey } from "../lib/maptiler";

const lire = (): ReglagesFournisseurs => { try { return lireReglagesFournisseurs(localStorage.getItem(CLE_STOCKAGE_FOURNISSEURS)); } catch { return lireReglagesFournisseurs(null); } };
const ecrire = (r: ReglagesFournisseurs) => { localStorage.setItem(CLE_STOCKAGE_FOURNISSEURS, JSON.stringify(r)); };

interface Saisie { id: string | null; nom: string; modele: string; cle: string; attribution: string; zoomMax: string }
const VIDE: Saisie = { id: null, nom: "", modele: "", cle: "", attribution: "", zoomMax: "" };
const identifiant = (nom: string, pris: readonly string[]) => {
  const base = nom.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "fournisseur";
  let id = base === "maptiler" ? "maptiler-2" : base;
  for (let i = 2; pris.includes(id); i++) id = `${base}-${i}`;
  return id;
};

export function FournisseursCarte() {
  const [reglages, setReglages] = useState<ReglagesFournisseurs>(lire);
  const [saisie, setSaisie] = useState<Saisie | null>(null);
  // Arrivée depuis GeoData (menu ☰ › Cartes › Fournisseurs › Nouveau, D-GD-36) : le formulaire d'ajout existant s'ouvre.
  useEffect(() => {
    if (window.location.hash !== "#settings-fournisseurs-ajouter") return;
    setSaisie(VIDE);
    document.getElementById("settings-fournisseurs")?.scrollIntoView({ block: "start" });
  }, []);
  const [erreurs, setErreurs] = useState<readonly string[]>([]);
  const [avis, setAvis] = useState<string | null>(null);
  const cleMaptiler = !!maptilerKey();
  const enregistrer = (r: ReglagesFournisseurs, message: string) => {
    try { ecrire(r); setReglages(r); setAvis(message); } catch { setAvis("Stockage local indisponible : réglage non conservé."); }
  };
  const remplacer = (f: FournisseurCarte) => reglages.fournisseurs.map((x) => (x.id === f.id ? f : x));
  const soumettre = (e: FormEvent) => {
    e.preventDefault();
    if (!saisie) return;
    const autres = reglages.fournisseurs.filter((f) => f.id !== saisie.id);
    const id = saisie.id ?? identifiant(saisie.nom, reglages.fournisseurs.map((f) => f.id));
    const v = validerFournisseurSaisi(saisie, id, autres.map((f) => f.nom));
    if (!v.ok) return setErreurs(v.erreurs);
    const ancien = reglages.fournisseurs.find((f) => f.id === id);
    const f = { ...v.valeur, actif: ancien?.actif ?? true };
    enregistrer({ ...reglages, fournisseurs: ancien ? remplacer(f) : [...reglages.fournisseurs, f] }, ancien ? "Fournisseur modifié." : "Fournisseur ajouté.");
    setSaisie(null); setErreurs([]);
  };
  return (
    <section className="panel settings-section" id="settings-fournisseurs" aria-labelledby="settings-fournisseurs-title" data-settings-fournisseurs>
      <h2 id="settings-fournisseurs-title">Fournisseurs de fonds de carte</h2>
      <p className="panel-sub">
        Fonds proposés par GeoData (liste « Fond »). MapTiler est intégré et utilise la clé de « Connexion MapTiler ». Un autre fournisseur se saisit par
        son adresse de tuiles XYZ. Adresses et clés restent dans ce navigateur : elles ne sont jamais envoyées à l’API Fadi. Un fond de fournisseur n’est
        pas exportable (conditions non établies) : l’export se fait sur le fond neutre.
      </p>
      <ul className="settings-fournisseurs">
        {reglages.fournisseurs.map((f) => (
          <li key={f.id} data-fournisseur={f.id}>
            <label className="h7-checkbox">
              <input type="radio" name="fournisseur-defaut" checked={reglages.defaut === f.id} onChange={() => enregistrer({ ...reglages, defaut: f.id }, `${f.nom} : fournisseur par défaut.`)} data-fournisseur-defaut={f.id} />
              <strong translate="no">{f.nom}</strong>
              {reglages.defaut === f.id && <span className="settings-badge">Par défaut</span>}
            </label>
            <p className="h7-muted">
              {f.type === "maptiler"
                ? `${f.styles.map((s) => s.libelle).join(" · ")} · ${cleMaptiler ? "clé MapTiler présente" : "clé MapTiler absente : saisissez-la dans « Connexion MapTiler »"}`
                : `${f.cle ? "clé saisie" : "sans clé"}${f.zoomMax ? ` · zoom maximal ${f.zoomMax}` : ""}`}
              {" · "}<span translate="no">{f.attribution}</span>
            </p>
            <div className="h7-actions">
              <label className="h7-checkbox">
                <input type="checkbox" checked={f.actif} onChange={(e) => enregistrer({ ...reglages, fournisseurs: remplacer({ ...f, actif: e.target.checked }) }, e.target.checked ? `${f.nom} activé.` : `${f.nom} désactivé.`)} data-fournisseur-actif={f.id} />
                Actif
              </label>
              {f.type === "xyz" && (
                <>
                  <button type="button" className="button-secondary" onClick={() => { setSaisie({ id: f.id, nom: f.nom, modele: f.styles[0]?.modele ?? "", cle: f.cle ?? "", attribution: f.attribution, zoomMax: f.zoomMax ? String(f.zoomMax) : "" }); setErreurs([]); }} data-fournisseur-modifier={f.id}>Modifier</button>
                  <button type="button" className="button-secondary" onClick={() => enregistrer({ fournisseurs: reglages.fournisseurs.filter((x) => x.id !== f.id), defaut: reglages.defaut === f.id ? "maptiler" : reglages.defaut }, `${f.nom} supprimé.`)} data-fournisseur-supprimer={f.id}>Supprimer</button>
                </>
              )}
            </div>
          </li>
        ))}
        <li>
          <label className="h7-checkbox">
            <input type="radio" name="fournisseur-defaut" checked={reglages.defaut === null} onChange={() => enregistrer({ ...reglages, defaut: null }, "Fond neutre par défaut.")} data-fournisseur-defaut="neutre" />
            <strong>Fond neutre (sans fournisseur)</strong>
          </label>
        </li>
      </ul>
      {!saisie && <button type="button" className="button-secondary" onClick={() => { setSaisie(VIDE); setErreurs([]); }} data-fournisseur-ajouter>Ajouter un fournisseur</button>}
      {saisie && (
        <form className="settings-form" onSubmit={soumettre} data-fournisseur-formulaire>
          <label>Nom<input value={saisie.nom} onChange={(e) => setSaisie({ ...saisie, nom: e.target.value })} maxLength={60} data-fournisseur-nom /></label>
          <label>Adresse des tuiles (XYZ, https)<input value={saisie.modele} onChange={(e) => setSaisie({ ...saisie, modele: e.target.value })} placeholder="https://…/{z}/{x}/{y}.png?key={cle}" autoComplete="off" spellCheck={false} data-fournisseur-modele /></label>
          <label>Clé (si l’adresse contient {"{cle}"})<input type="password" value={saisie.cle} onChange={(e) => setSaisie({ ...saisie, cle: e.target.value })} autoComplete="off" data-fournisseur-cle /></label>
          <label>Attribution (exigée par le fournisseur)<input value={saisie.attribution} onChange={(e) => setSaisie({ ...saisie, attribution: e.target.value })} maxLength={200} data-fournisseur-attribution /></label>
          <label>Zoom maximal (facultatif)<input type="number" min={1} max={24} value={saisie.zoomMax} onChange={(e) => setSaisie({ ...saisie, zoomMax: e.target.value })} data-fournisseur-zoom /></label>
          {erreurs.length > 0 && <ul role="alert" className="h7-muted settings-erreurs">{erreurs.map((x) => <li key={x}>{x}</li>)}</ul>}
          <div className="h7-actions">
            <button type="submit" className="button-primary" data-fournisseur-enregistrer>{saisie.id ? "Enregistrer les modifications" : "Ajouter"}</button>
            <button type="button" className="button-secondary" onClick={() => { setSaisie(null); setErreurs([]); }}>Annuler</button>
          </div>
        </form>
      )}
      {avis && <p className="h7-muted" role="status">{avis}</p>}
    </section>
  );
}
