/**
 * Panneau « Liens de consultation » (cas 4 du catalogue des extensions, étape 7d : D11-F18-018 ; maquette
 * `analyses/catalogue-extensions/cas-4/maquettes/etape-7-hote.png`, quart 7d) : une copie figée de la Planche, en lecture
 * seule, ouvrable sans compte sur téléphone (navigation, scènes et mesure). Échéance et mesure choisies avant de créer ;
 * liste des versions figées : copier, révoquer. Le modèle n'est jamais modifié par le lien.
 */
import { LOCALE } from "../../../lib/i18n";
import { t } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_CONSULTATION, type Disponibilite, type IdCommandeConsultation } from "./commandes-objets";
import { adresseLien, lienActif, type LienConsultation } from "./consultations-client";
import { afficherRaccourci } from "./outils-planche";

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();
const dateCourte = (j: string | null): string => (j ? new Date(`${j}T12:00:00`).toLocaleDateString(LOCALE) : "—");
/** « 27.11.2026 14 h 05 » (heure de l'appareil). */
export const versionFigee = (iso: string): string => {
  const d = new Date(iso);
  return `${d.toLocaleDateString(LOCALE)} ${LOCALE.startsWith("fr") ? `${d.getHours()} h ${String(d.getMinutes()).padStart(2, "0")}` : d.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" })}`;
};

export function PanneauConsultations({
  liens,
  charge,
  choisi,
  echeance,
  mesure,
  aujourdhui,
  origine,
  onEcheance,
  onMesure,
  onChoisir,
  executer,
  disponibilite,
  erreur,
  note,
}: {
  liens: readonly LienConsultation[];
  charge: boolean;
  choisi: LienConsultation | null;
  echeance: string;
  mesure: boolean;
  aujourdhui: string;
  origine: string;
  onEcheance: (v: string) => void;
  onMesure: (v: boolean) => void;
  onChoisir: (jeton: string) => void;
  executer: (id: IdCommandeConsultation) => void;
  disponibilite: (id: IdCommandeConsultation) => Disponibilite;
  erreur: string | null;
  note: string | null;
}) {
  const bouton = (id: IdCommandeConsultation, classe = "", libre = false) => {
    const c = COMMANDES_CONSULTATION.find((x) => x.id === id)!;
    const d = disponibilite(id);
    return (
      <button key={id} type="button" className={classe} disabled={!d.disponible} title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`} aria-label={t(c.libelle)} onClick={(e) => { if (libre) e.stopPropagation(); executer(id); }} data-planche-commande={id}>
        <Pictogramme picto={c.picto} /> {t(c.court)} ({afficherRaccourci(c.raccourci)})
      </button>
    );
  };
  const exemple = choisi ?? liens.find((l) => lienActif(l, aujourdhui)) ?? null;
  return (
    <div className="planche-controle planche-reserves planche-consultations" data-planche-consultations={liens.length}>
      <p className="inspecteur-aide">{t("planche.consultation.intro")}</p>
      <div className="planche-consultations-reglages">
        <label className="planche-reserves-champ">
          <span>{t("planche.consultation.champ.echeance")}</span>
          <input type="date" value={echeance} min={aujourdhui} onKeyDown={arreter} onChange={(e) => onEcheance(e.target.value)} data-planche-consultation-champ="echeance" />
        </label>
        <label className="planche-reserves-champ">
          <span>{t("planche.consultation.champ.mesure")}</span>
          <select value={mesure ? "oui" : "non"} onKeyDown={arreter} onChange={(e) => onMesure(e.target.value === "oui")} data-planche-consultation-champ="mesure">
            <option value="oui">{t("planche.consultation.mesure.oui")}</option>
            <option value="non">{t("planche.consultation.mesure.non")}</option>
          </select>
        </label>
      </div>
      <div className="planche-enveloppe-actions">{bouton("creer-lien", "est-principal")}</div>
      {!charge ? (
        <p className="inspecteur-aide">{t("planche.consultation.chargement")}</p>
      ) : liens.length === 0 ? (
        <p className="inspecteur-aide" data-planche-consultations-vide>{t("planche.consultation.vide")}</p>
      ) : (
        <table className="planche-reserves-table planche-consultations-table">
          <thead>
            <tr><th>{t("planche.consultation.col.version")}</th><th>{t("planche.consultation.col.echeance")}</th><th /></tr>
          </thead>
          <tbody>
            {liens.map((l) => {
              const actif = lienActif(l, aujourdhui);
              const est = l.jeton === choisi?.jeton;
              return (
                <tr key={l.jeton} className={est ? "est-choisi" : ""} onClick={() => onChoisir(l.jeton)} data-planche-consultation={l.jeton} data-etat={l.revoqueLe ? "revoque" : actif ? "actif" : "echu"}>
                  <td><button type="button" onClick={() => onChoisir(l.jeton)} aria-pressed={est}>{versionFigee(l.creeLe)}</button></td>
                  <td>{dateCourte(l.echeance)}</td>
                  <td className="planche-consultations-actions">
                    {actif && est ? (
                      <>
                        {bouton("copier-lien", "", true)}
                        {bouton("revoquer-lien", "", true)}
                      </>
                    ) : actif ? null : (
                      <span className="planche-reserves-etat">{t(l.revoqueLe ? "planche.consultation.revoque" : "planche.consultation.echu")}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {erreur && <p className="planche-message" role="alert" data-planche-consultations-erreur>{erreur}</p>}
      {note && <p className="inspecteur-aide" data-planche-consultations-note>{note}</p>}
      <p className="inspecteur-aide" data-planche-consultation-adresse>
        {t("planche.consultation.aide", { adresse: exemple ? `${adresseLien(exemple.jeton, origine).slice(0, origine.length + 18)}…` : `${origine}/consultation/…` })}
      </p>
    </div>
  );
}
