/**
 * Panneau de l'étape 7e du lot C4 (cas 4 du catalogue des extensions : D10-F14-082) : « Lot d'échange ». Jeu nommé
 * (enregistré ou nouveau), sorties cochées, destinataire, émission en une archive datée avec manifeste d'empreintes,
 * registre des lots émis. L'aperçu du manifeste est une carte à part, posée sur la vue (maquette validée).
 */
import type { CleMessage } from "../messages";
import { t } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import type { SortieLot } from "@parcours/sandbox-planche-model";
import { COMMANDES_LOT, type Disponibilite, type IdCommandeLot } from "./commandes-objets";
import { afficherRaccourci } from "./outils-planche";

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();
const SORTIES: readonly SortieLot[] = ["ifc", "dxf", "pdf", "csv", "png"];

export interface LigneRegistreLot {
  readonly id: string;
  readonly date: string;
  readonly jeu: string;
  readonly destinataire: string;
  readonly manifeste: string;
}

export function PanneauLotEchange({
  jeux,
  jeuChoisi,
  onJeuChoisi,
  nomJeu,
  onNomJeu,
  sorties,
  onSortie,
  details,
  destinataire,
  onDestinataire,
  registre,
  executer,
  disponibilite,
  erreur,
  note,
}: {
  jeux: readonly { readonly id: string; readonly nom: string }[];
  jeuChoisi: string;
  onJeuChoisi: (id: string) => void;
  nomJeu: string;
  onNomJeu: (v: string) => void;
  sorties: ReadonlySet<SortieLot>;
  onSortie: (s: SortieLot, v: boolean) => void;
  details: Readonly<Partial<Record<SortieLot, string>>>;
  destinataire: string;
  onDestinataire: (v: string) => void;
  registre: readonly LigneRegistreLot[];
  executer: (id: IdCommandeLot) => void;
  disponibilite: (id: IdCommandeLot) => Disponibilite;
  erreur: string | null;
  note: string | null;
}) {
  const c = COMMANDES_LOT.find((x) => x.id === "emettre-lot")!;
  const d = disponibilite("emettre-lot");
  const touche = c.raccourci.split(",").pop()!.trim();
  return (
    <div className="planche-controle planche-fonds planche-ifc planche-visionneuse planche-lot" data-planche-lot>
      <p className="inspecteur-aide">{t("planche.lot.aide")}</p>
      <p className="planche-statut-titre"><b>{t("planche.lot.jeu")}</b></p>
      <div className="planche-lot-ligne">
        <select value={jeuChoisi} onKeyDown={arreter} onChange={(e) => onJeuChoisi(e.target.value)} aria-label={t("planche.lot.jeu")} data-planche-lot-jeux>
          {jeux.map((j) => (
            <option key={j.id} value={j.id}>{j.nom}</option>
          ))}
          <option value="">{t("planche.lot.jeu.nouveau")}</option>
        </select>
        <input type="text" value={nomJeu} onKeyDown={arreter} onChange={(e) => onNomJeu(e.target.value)} aria-label={t("planche.lot.jeu.nom")} data-planche-lot-nom />
      </div>
      <p className="planche-statut-titre"><b>{t("planche.lot.sorties")}</b></p>
      <div className="planche-visionneuse-choix planche-lot-sorties">
        {SORTIES.map((s) => (
          <label key={s}>
            <input type="checkbox" checked={sorties.has(s)} onKeyDown={arreter} onChange={(e) => onSortie(s, e.target.checked)} data-planche-lot-sortie={s} /> {t(`planche.lot.sortie.${s}` as CleMessage)}
            {details[s] && <small> {details[s]}</small>}
          </label>
        ))}
      </div>
      <div className="planche-lot-ligne">
        <span>{t("planche.lot.destinataire")}</span>
        <input type="text" value={destinataire} onKeyDown={arreter} onChange={(e) => onDestinataire(e.target.value)} aria-label={t("planche.lot.destinataire")} data-planche-lot-destinataire />
      </div>
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.lot.barre")}>
        <button
          type="button"
          className="est-principal"
          disabled={!d.disponible}
          title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`}
          aria-label={t(c.libelle)}
          onClick={() => executer("emettre-lot")}
          data-planche-commande="emettre-lot"
        >
          <Pictogramme picto={c.picto} /> {t(c.court)} <kbd>{afficherRaccourci(touche)}</kbd>
        </button>
      </div>
      {erreur && <p className="planche-message" role="alert" data-planche-lot-erreur>{erreur}</p>}
      {note && <p className="inspecteur-aide" data-planche-lot-note>{note}</p>}
      <p className="planche-statut-titre"><b>{t("planche.lot.registre")}</b></p>
      {registre.length === 0 ? (
        <p className="inspecteur-aide" data-planche-lot-registre-vide>{t("planche.lot.registre.vide")}</p>
      ) : (
        <table className="planche-lot-registre" data-planche-lot-registre={registre.length}>
          <thead>
            <tr>
              <th>{t("planche.lot.registre.date")}</th>
              <th>{t("planche.lot.registre.jeu")}</th>
              <th>{t("planche.lot.registre.destinataire")}</th>
              <th>{t("planche.lot.registre.manifeste")}</th>
            </tr>
          </thead>
          <tbody>
            {registre.map((l) => (
              <tr key={l.id}>
                <td>{l.date}</td>
                <td>{l.jeu}</td>
                <td>{l.destinataire}</td>
                <td className="planche-lot-mono">{l.manifeste}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="inspecteur-aide">{t("planche.lot.note.registre")}</p>
    </div>
  );
}

/** Carte « Aperçu du manifeste », posée sur la vue à gauche du panneau. */
export function ApercuManifeste({ texte, archive }: { texte: string; archive: string }) {
  return (
    <aside className="planche-lot-apercu" aria-label={t("planche.lot.apercu")} data-planche-lot-apercu>
      <b>{t("planche.lot.apercu")}</b> <span>{t("planche.lot.apercu.aide")}</span>
      <pre data-planche-lot-manifeste>{texte}</pre>
      <p className="inspecteur-aide" data-planche-lot-archive>{t("planche.lot.apercu.archive", { nom: archive })}</p>
    </aside>
  );
}
