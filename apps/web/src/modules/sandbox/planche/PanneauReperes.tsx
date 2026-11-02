/**
 * Panneau « Repères » (chantier Axes, lot AX-3 ; concept Axes 1.0, § 6.1 et § 6.2) : gestionnaire des repères
 * enregistrés de la Planche — rechercher, activer, enregistrer, renommer, dupliquer, supprimer —, état du repère actif
 * (« Modifié » : enregistrer les modifications ou comme nouveau ; jamais d'écrasement silencieux), et affichage des axes
 * et de la triade d'orientation. Les enregistrements sont des pas d'historique ; le contexte de travail ne l'est pas.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { type ContexteTravail, type EtatRepereActif, type Modele, disponibiliteCoordonnees, normaliserTexte, referencesRepere, reperesEnregistres, santeRepere } from "@parcours/sandbox-planche-model";
import { t } from "../messages";
import { COINS_TRIADE, type CoinTriade, type PreferencesTriade } from "./triade";

export interface PropsPanneauReperes {
  modele: Modele;
  contexte: ContexteTravail;
  etat: EtatRepereActif;
  nomActif: string;
  lecture: boolean;
  /** Change pour placer le focus sur le champ du nom (commande « Enregistrer le repère », Alt + Maj + 9). */
  demandeEnregistrer: number;
  axesVisibles: boolean;
  triade: PreferencesTriade;
  onActiver: (id: string) => void;
  onEnregistrerNouveau: (nom: string) => string | null;
  onEnregistrerModifications: () => string | null;
  onRenommer: (id: string, nom: string) => string | null;
  onDupliquer: (id: string, nom: string) => string | null;
  onSupprimer: (id: string, detacher: boolean) => string | null;
  onAxes: (visible: boolean) => void;
  onTriade: (p: PreferencesTriade) => void;
  /** AX-5 : face de la racine sélectionnée (lien possible), sinon `null`. */
  faceLiable: string | null;
  onEnregistrerLie: (nom: string) => string | null;
  onMajSource: (id: string) => string | null;
  onDetacherLien: (id: string) => string | null;
  coordonneesExport: "modele" | "travail" | "source";
  onCoordonneesExport: (c: "modele" | "travail" | "source") => void;
}

export function PanneauReperes(p: PropsPanneauReperes) {
  const liste = useMemo(() => reperesEnregistres(p.modele), [p.modele]);
  const [recherche, setRecherche] = useState("");
  const [nom, setNom] = useState("");
  const [edition, setEdition] = useState<{ id: string; nom: string } | null>(null);
  const [suppression, setSuppression] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const champNom = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (p.demandeEnregistrer > 0) champNom.current?.focus();
  }, [p.demandeEnregistrer]);

  const filtre = normaliserTexte(recherche.trim());
  const visibles = filtre ? liste.filter((r) => normaliserTexte(r.nom).includes(filtre)) : liste;
  const actifId = p.contexte.source.genre === "enregistre" ? p.contexte.source.id : p.contexte.source.genre === "temporaire" ? p.contexte.source.depuis?.id : undefined;
  const nomParDefaut = t("planche.reperes.enregistrer.defaut", { numero: String(liste.length + 1) });
  const faire = (r: string | null, apres?: () => void) => {
    setErreur(r);
    if (!r) apres?.();
  };

  return (
    <div className="planche-options planche-reperes-panneau" data-planche-reperes>
      <p className="planche-reperes-actif" data-reperes-actif={p.etat}>
        <strong>{t("planche.reperes.cmd.choisir-repere")} :</strong> {p.nomActif}
        {p.etat === "modifie" && <span className="planche-reperes-badge" data-reperes-modifie> {t("planche.reperes.modifie")}</span>}
        {p.etat === "perime" && <span className="planche-reperes-badge"> — {t("planche.reperes.perime")}</span>}
        {p.etat === "absent" && <span className="planche-reperes-badge"> — {t("planche.reperes.absent")}</span>}
      </p>
      {p.etat === "modifie" && (
        <button type="button" disabled={p.lecture} onClick={() => faire(p.onEnregistrerModifications())} data-reperes-enregistrer-modifications>
          {t("planche.reperes.enregistrer.modifications")}
        </button>
      )}
      <form
        className="planche-reperes-enregistrer"
        onSubmit={(e) => {
          e.preventDefault();
          faire(p.onEnregistrerNouveau(nom.trim() === "" ? nomParDefaut : nom), () => setNom(""));
        }}
      >
        <label>
          {t("planche.reperes.enregistrer.nom")}
          <input ref={champNom} value={nom} placeholder={nomParDefaut} onChange={(e) => setNom(e.target.value)} disabled={p.lecture} data-reperes-nom />
        </label>
        <button type="submit" disabled={p.lecture} data-reperes-enregistrer>
          {p.etat === "modifie" ? t("planche.reperes.enregistrer.nouveau") : t("planche.reperes.cmd.enregistrer-repere")}
        </button>
        <button
          type="button"
          disabled={p.lecture || !p.faceLiable}
          title={p.faceLiable ? undefined : t("planche.reperes.lier.motif")}
          onClick={() => faire(p.onEnregistrerLie(nom.trim() === "" ? nomParDefaut : nom), () => setNom(""))}
          data-reperes-lier
        >
          {t("planche.reperes.lier")}
        </button>
      </form>
      <p className="planche-reperes-portee">{t("planche.reperes.portee-planche")}</p>
      {liste.length > 0 && (
        <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder={t("planche.reperes.rechercher")} aria-label={t("planche.reperes.rechercher")} data-reperes-recherche />
      )}
      {liste.length === 0 ? (
        <p>{t("planche.reperes.aucun")}</p>
      ) : visibles.length === 0 ? (
        <p>{t("planche.reperes.aucun-resultat")}</p>
      ) : (
        <ul className="planche-reperes-liste" data-reperes-enregistres>
          {visibles.map((r) => {
            const scenes = referencesRepere(p.modele, r.id).length;
            const sante = santeRepere(p.modele, r);
            return (
              <li key={r.id} className={actifId === r.id ? "est-actif" : undefined} data-repere-enregistre={r.id}>
                {edition?.id === r.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      faire(p.onRenommer(r.id, edition.nom), () => setEdition(null));
                    }}
                  >
                    <input value={edition.nom} onChange={(e) => setEdition({ id: r.id, nom: e.target.value })} aria-label={t("planche.reperes.renommer")} autoFocus data-reperes-renommer-champ />
                    <button type="submit" data-reperes-renommer-valider>{t("planche.reperes.valider")}</button>
                    <button type="button" onClick={() => setEdition(null)}>{t("planche.reperes.annuler")}</button>
                  </form>
                ) : (
                  <>
                    <button type="button" className="planche-reperes-nom-bouton" aria-pressed={actifId === r.id} onClick={() => p.onActiver(r.id)} data-reperes-activer={r.id}>
                      {r.nom}
                    </button>
                    <span className={`planche-reperes-details${sante === "perime" || sante === "manquant" ? " est-alerte" : ""}`} data-reperes-sante={sante}>
                      {sante === "instantane"
                        ? t("planche.reperes.ligne.details", { revision: String(r.revision), scenes: String(scenes) })
                        : t("planche.reperes.ligne.details.lie", { revision: String(r.revision), sante: t(`planche.reperes.sante.${sante}`), scenes: String(scenes) })}
                    </span>
                    {sante !== "instantane" && (
                      <span className="planche-reperes-actions">
                        {sante === "perime" && (
                          <button type="button" disabled={p.lecture} onClick={() => faire(p.onMajSource(r.id))} data-reperes-maj-source={r.id}>{t("planche.reperes.maj-source")}</button>
                        )}
                        <button type="button" disabled={p.lecture} onClick={() => faire(p.onDetacherLien(r.id))} data-reperes-detacher-lien={r.id}>{t("planche.reperes.detacher-lien")}</button>
                      </span>
                    )}
                    <span className="planche-reperes-actions">
                      <button type="button" disabled={p.lecture} onClick={() => setEdition({ id: r.id, nom: r.nom })} data-reperes-renommer={r.id}>{t("planche.reperes.renommer")}</button>
                      <button type="button" disabled={p.lecture} onClick={() => faire(p.onDupliquer(r.id, t("planche.reperes.copie", { nom: r.nom })))} data-reperes-dupliquer={r.id}>{t("planche.reperes.dupliquer")}</button>
                      <button
                        type="button"
                        disabled={p.lecture}
                        onClick={() => (scenes > 0 ? setSuppression(r.id) : faire(p.onSupprimer(r.id, false)))}
                        data-reperes-supprimer={r.id}
                      >
                        {t("planche.reperes.supprimer")}
                      </button>
                    </span>
                    {suppression === r.id && (
                      <div role="alertdialog" aria-label={t("planche.reperes.supprimer")} className="planche-reperes-confirmation" data-reperes-confirmation>
                        <p>{t("planche.reperes.supprimer.references", { nom: r.nom, scenes: String(scenes) })}</p>
                        <button type="button" onClick={() => faire(p.onSupprimer(r.id, true), () => setSuppression(null))} data-reperes-detacher>{t("planche.reperes.supprimer.detacher")}</button>
                        <button type="button" onClick={() => setSuppression(null)} data-reperes-supprimer-annuler>{t("planche.reperes.annuler")}</button>
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {erreur && <p className="planche-reperes-erreur" role="alert" data-reperes-panneau-erreur>{erreur}</p>}
      <fieldset className="planche-reperes-affichage">
        <legend>{t("planche.reperes.exports")}</legend>
        {(["modele", "travail", "source"] as const).map((c) => {
          const motif = disponibiliteCoordonnees(p.modele, c, "obj");
          return (
            <label key={c} title={motif ?? undefined}>
              <input type="radio" name="reperes-exports" checked={p.coordonneesExport === c} disabled={motif !== null} onChange={() => p.onCoordonneesExport(c)} data-reperes-exports={c} />
              {t(`planche.reperes.exports.${c}`)}
              {motif && <span className="planche-reperes-details"> — {motif}</span>}
            </label>
          );
        })}
      </fieldset>
      <fieldset className="planche-reperes-affichage">
        <legend>{t("planche.reperes.affichage")}</legend>
        <label>
          <input type="checkbox" checked={p.axesVisibles} onChange={(e) => p.onAxes(e.target.checked)} data-reperes-axes-visibles />
          {t("planche.reperes.affichage.axes")}
        </label>
        <label>
          <input type="checkbox" checked={p.triade.visible} onChange={(e) => p.onTriade({ ...p.triade, visible: e.target.checked })} data-reperes-triade-visible />
          {t("planche.reperes.affichage.triade")}
        </label>
        <label>
          {t("planche.reperes.affichage.coin")}
          <select value={p.triade.coin} onChange={(e) => p.onTriade({ ...p.triade, coin: e.target.value as CoinTriade })} data-reperes-triade-coin>
            {COINS_TRIADE.map((c) => (
              <option key={c} value={c}>{t(`planche.reperes.affichage.coin.${c}`)}</option>
            ))}
          </select>
        </label>
        <label>
          {t("planche.reperes.affichage.represente")}
          <select value={p.triade.represente} onChange={(e) => p.onTriade({ ...p.triade, represente: e.target.value === "modele" ? "modele" : "travail" })} data-reperes-triade-represente>
            <option value="travail">{t("planche.reperes.affichage.represente.travail")}</option>
            <option value="modele">{t("planche.reperes.affichage.represente.modele")}</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked={p.triade.export} onChange={(e) => p.onTriade({ ...p.triade, export: e.target.checked })} data-reperes-triade-export />
          {t("planche.reperes.affichage.export")}
        </label>
      </fieldset>
    </div>
  );
}
