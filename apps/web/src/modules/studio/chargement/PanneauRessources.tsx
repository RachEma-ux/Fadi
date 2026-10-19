/**
 * Ressources d'exécution dans le gestionnaire « Outils » (B.3-08, B.3-09, B.3-10, X.1-09) : pour chaque moteur, les
 * quatre états techniques distincts (téléchargé, initialisé, actif, disponible hors connexion), la vérification du
 * cache, la préparation du profil hors ligne, la liste des outils indisponibles hors connexion, la libération d'un
 * moteur inactif, l'état de la file locale pendant une mise à jour, et le relevé PERF-01 à PERF-10 (sans seuil).
 */
import { useEffect, useSyncExternalStore } from "react";
import { STUDIO_TOOLS } from "@parcours/atelier-model";
import { LOCALE } from "../../../lib/i18n";
import { LIBELLES_ETATS, LIBELLES_PHASES, MESSAGES_ERREUR_MOTEUR, type EtatMoteur } from "./gestionnaire-ressources";
import { abonnerHorsConnexion, lireHorsConnexion, preparer, verifier } from "./hors-connexion-studio";
import { moteur } from "./moteurs";
import { DEFINITIONS_PERF, perfStudio, type SyntheseCode } from "./perf";
import { ressourcesStudio } from "./ressources-studio";
import { gabarit, TEXTES_RESSOURCES as T } from "./textes";
import { useEtatsRessources } from "./useRessources";
import "./chargement.css";

const oui = (v: boolean | null) => (v === null ? "non-evalue" : v ? "oui" : "non");
const libelle = (v: boolean | null) => (v === null ? LIBELLES_ETATS.nonEvalue : v ? LIBELLES_ETATS.oui : LIBELLES_ETATS.non);

function LigneMoteur({ e }: { e: EtatMoteur }) {
  const peut = ressourcesStudio.peutLiberer(e.id);
  return (
    <tr data-studio-moteur={e.id} data-telecharge={oui(e.telecharge)} data-initialise={oui(e.initialise)} data-actif={oui(e.actif)}
      data-hors-connexion={oui(e.horsConnexion)} data-phase={e.phase} data-initialisations={e.initialisations}>
      <th scope="row">{moteur(e.id).libelleFR}<br /><code translate="no">{e.id}</code></th>
      <td>{libelle(e.telecharge)}</td>
      <td>{libelle(e.initialise)}</td>
      <td>{libelle(e.actif)}</td>
      <td>{libelle(e.horsConnexion)}</td>
      <td>{LIBELLES_PHASES[e.phase]}{e.erreur && <><br />{MESSAGES_ERREUR_MOTEUR[e.erreur]}</>}</td>
      <td>{e.usages.length}{peut && <> <button type="button" onClick={() => ressourcesStudio.liberer(e.id)} data-studio-liberer={e.id}>{T.liberer}</button></>}</td>
    </tr>
  );
}

const nombre = (v: number | null, unite: string | null) => (v === null ? "" : unite === "octets" ? gabarit(T.tas, (v / 1_048_576).toLocaleString(LOCALE, { maximumFractionDigits: 1 })) : unite === "ms" ? `${v.toLocaleString(LOCALE, { maximumFractionDigits: 1 })} ms` : v.toLocaleString(LOCALE));

function ReleverPerf() {
  useSyncExternalStore(perfStudio.abonner, perfStudio.lireVersion, perfStudio.lireVersion);
  const synthese = new Map<string, SyntheseCode>(perfStudio.synthese().map((s) => [s.code, s]));
  const telecharger = () => {
    const blob = new Blob([JSON.stringify(perfStudio.releve({ build: document.querySelector('meta[name="fadi-build"]')?.getAttribute("content") ?? null, agent: navigator.userAgent }), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "studio-releve-perf.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return (
    <section aria-labelledby="studio-perf-titre" data-studio-releve-perf>
      <h4 id="studio-perf-titre">{T.perfTitre}</h4>
      <p className="studio-dialogue-aide">{T.perfAide}</p>
      <table className="studio-ressources-table">
        <thead><tr><th scope="col">{T.colCode}</th><th scope="col">{T.colMesure}</th><th scope="col">{T.colN}</th><th scope="col">{T.colMediane}</th><th scope="col">{T.colDerniere}</th></tr></thead>
        <tbody>
          {DEFINITIONS_PERF.map((d) => {
            const s = synthese.get(d.code)!;
            return (
              <tr key={d.code} data-studio-perf={d.code} data-n={s.n}>
                <th scope="row" translate="no">{d.code}</th>
                <td>{d.mesure}</td>
                <td>{s.n}</td>
                <td>{d.etat === "non-applicable" ? T.nonApplicable : s.n ? nombre(s.mediane, s.unite) : T.nonMesure}</td>
                <td>{s.derniere ? nombre(s.derniere.valeur, s.derniere.unite) : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" onClick={telecharger} data-studio-telecharger-releve>{T.telechargerReleve}</button>
    </section>
  );
}

export function PanneauRessources() {
  const etats = useEtatsRessources();
  const hc = useSyncExternalStore(abonnerHorsConnexion, lireHorsConnexion, lireHorsConnexion);
  useEffect(() => { if (!hc.verification && hc.enCours === "aucun") void verifier(); }, [hc.verification, hc.enCours]);
  const v = hc.verification;
  const raison = v?.raison === "sans-service-worker" ? T.nonEvalueSansSw : v?.raison === "sans-carte" ? T.nonEvalueSansCarte : v?.raison === "sans-cache-du-build" ? T.nonEvalueSansCache : null;
  const indisponibles = hc.indisponibles ? STUDIO_TOOLS.filter((t) => hc.indisponibles!.includes(t.toolId)) : null;
  return (
    <section className="studio-ressources" aria-labelledby="studio-ressources-titre" data-studio-ressources data-studio-verification={v?.raison ?? "aucune"}>
      <h3 id="studio-ressources-titre">{T.titre}</h3>
      <p className="studio-dialogue-aide">{T.aide}</p>
      <table className="studio-ressources-table">
        <caption>{T.legende}</caption>
        <thead>
          <tr>
            <th scope="col">{T.colMoteur}</th><th scope="col">{LIBELLES_ETATS.telecharge}</th><th scope="col">{LIBELLES_ETATS.initialise}</th>
            <th scope="col">{LIBELLES_ETATS.actif}</th><th scope="col">{LIBELLES_ETATS.horsConnexion}</th><th scope="col">{T.colEtat}</th><th scope="col">{T.colUsages}</th>
          </tr>
        </thead>
        <tbody>{etats.map((e) => <LigneMoteur key={e.id} e={e} />)}</tbody>
      </table>
      <div className="studio-ressources-actions">
        <button type="button" disabled={hc.enCours !== "aucun"} onClick={() => void verifier()} data-studio-verifier-cache>{T.verifier}</button>
        <button type="button" disabled={hc.enCours !== "aucun" || v?.raison !== "evalue"} onClick={() => void preparer()} data-studio-preparer-hors-ligne>{T.preparer}</button>
      </div>
      <p role="status" className="studio-dialogue-aide" data-studio-hors-ligne-etat={hc.enCours}>
        {hc.enCours === "verification" ? T.verification : hc.enCours === "preparation" ? T.preparation : raison
          ?? (indisponibles && indisponibles.length === 0 ? T.toutDisponible : indisponibles ? gabarit(T.indisponibles, indisponibles.length) : "")}
      </p>
      {indisponibles && indisponibles.length > 0 && (
        <ul className="studio-ressources-indisponibles" data-studio-indisponibles-hors-ligne={indisponibles.length}>
          {indisponibles.map((t) => <li key={t.toolId} data-studio-indisponible-hors-ligne={t.toolId}>{t.libelleFR}</li>)}
        </ul>
      )}
      {hc.preparation && hc.preparation.raison === "evalue" && (
        <p className="studio-dialogue-aide" data-studio-preparation-ranges={hc.preparation.ranges.length} data-studio-preparation-echecs={hc.preparation.echecs.length}>
          {gabarit(T.ranges, hc.preparation.ranges.length, hc.preparation.echecs.length)}
        </p>
      )}
      <p className="studio-dialogue-aide" data-studio-file-locale={hc.fileLocale ?? "non-evalue"} data-studio-persistance={hc.persistance}>
        {hc.fileLocale === null ? T.fileLocaleNonEvaluee : gabarit(T.fileLocale, hc.fileLocale)} {T.persistance[hc.persistance]}
      </p>
      {v?.raison === "cache-purge" && <p className="studio-alert" role="alert" data-studio-cache-purge>{T.cachePurge}</p>}
      {hc.miseAJour && <p className="studio-alert" role="status" data-studio-mise-a-jour-sw>{T.miseAJour}</p>}
      <ReleverPerf />
    </section>
  );
}
