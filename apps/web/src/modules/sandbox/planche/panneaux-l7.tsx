/**
 * Cas 2 du catalogue, lot 7 (27 novembre 2026) : panneaux des versions, selon les maquettes acceptées le 27 novembre.
 * - « Versions et jalons » : statut et indice de révision, jalons figés avec leur empreinte, variantes dérivées, registre
 *   des émissions et partages (n° 38, 40, 62, 76) ;
 * - « Comparer » : deux états, objets ajoutés, supprimés et modifiés, surlignage dans la vue 3D (n° 33, 41, 48) ;
 * - « Brouillon » : essai sans toucher l'original, puis appliquer, garder comme variante ou abandonner (n° 73, 76) ;
 * - « Fiche du projet » : saisie une fois, reprise dans les pièces émises (n° 109).
 * Aucune donnée : tout vient de la Planche, de ses jalons ou de la saisie ; un champ vide reste « non renseigné ».
 */
import { useEffect, useState } from "react";
import { CHAMPS_FICHE, empreinteCourte, secondTemps, type ChampFiche, type Comparaison, type Emission, type FicheProjet, type Jalon, type ObjetCompare, type Revision } from "@parcours/sandbox-planche-model";
import { t, type CleMessage } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_VERSION, type Disponibilite, type IdCommandeVersion } from "./commandes-objets";
import { afficherRaccourci } from "./outils-planche";

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();
const commande = (id: IdCommandeVersion) => COMMANDES_VERSION.find((c) => c.id === id)!;
const dateCourte = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
export { dateCourte as dateVersion };

/** Raccourci affiché dans le titre d'un panneau du lot 7 (maquettes : « Versions et jalons  Ctrl+Maj+Espace, V »). */
export const RACCOURCI_PANNEAU_L7: Readonly<Record<string, string>> = {
  "versions-jalons": commande("versions").raccourci,
  comparer: commande("comparer").raccourci,
  brouillon: commande("brouillon").raccourci,
  "fiche-projet": commande("fiche-projet").raccourci,
};

/** Bouton d'une commande du lot 7 : libellé, raccourci en info-bulle, motif d'indisponibilité. */
function BoutonVersion({ id, libelle, d, onClick, principal = false, attribut }: { id: IdCommandeVersion; libelle: string; d: Disponibilite; onClick: () => void; principal?: boolean; attribut: string }) {
  const c = commande(id);
  return (
    <button
      type="button"
      className={principal ? "planche-bouton-principal" : undefined}
      disabled={!d.disponible}
      title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`}
      aria-keyshortcuts={c.raccourci.replace(/Maj/g, "Shift").replace(/Espace/g, "Space").replace(/, /g, " ")}
      onClick={onClick}
      {...{ [attribut]: "" }}
    >
      <Pictogramme picto={c.picto} /> {libelle} {principal && <small className="planche-versions-raccourci-bouton">{afficherRaccourci(secondTemps(c.raccourci) ?? c.raccourci)}</small>}
    </button>
  );
}

export interface VarianteAffichee {
  readonly id: string;
  readonly nom: string;
  readonly jalon: string | null;
  readonly creeA: string;
}

export function PanneauVersions({
  revision,
  statuts,
  onRevision,
  lecture,
  jalons,
  choisi,
  onChoisir,
  onPoserJalon,
  onDeriver,
  variantes,
  emissions,
  onDestinataire,
  origine,
  onOuvrirOrigine,
  disponibilite,
}: {
  revision: Revision | null;
  statuts: readonly string[];
  onRevision: (r: Revision) => void;
  lecture: boolean;
  jalons: readonly Jalon[];
  choisi: string | null;
  onChoisir: (id: string) => void;
  onPoserJalon: (nom: string) => void;
  onDeriver: (jalon: Jalon) => void;
  variantes: readonly VarianteAffichee[];
  emissions: readonly Emission[];
  onDestinataire: (id: string, destinataire: string) => void;
  origine: string | null;
  onOuvrirOrigine: (() => void) | null;
  disponibilite: (id: IdCommandeVersion) => Disponibilite;
}) {
  const [statut, setStatut] = useState(revision?.statut ?? "");
  const [indice, setIndice] = useState(revision?.indice ?? "");
  const [nom, setNom] = useState("");
  useEffect(() => {
    setStatut(revision?.statut ?? "");
    setIndice(revision?.indice ?? "");
  }, [revision?.statut, revision?.indice]);
  const valider = () => {
    if (statut.trim() !== (revision?.statut ?? "") || indice.trim() !== (revision?.indice ?? "")) onRevision({ statut, indice });
  };
  const jalon = jalons.find((j) => j.id === choisi) ?? jalons[0] ?? null;
  const nomJalon = (id: string | null) => jalons.find((j) => j.id === id)?.nom ?? null;
  return (
    <div className="planche-accrochage planche-versions" data-planche-versions>
      {origine && (
        <p className="planche-versions-origine" data-planche-versions-origine>
          {origine} {onOuvrirOrigine && <button type="button" className="planche-lien-bouton" onClick={onOuvrirOrigine} data-planche-versions-ouvrir-origine>{t("planche.version.ouvrir-origine")}</button>}
        </p>
      )}
      <label className="planche-accrochage-champ">
        {t("planche.version.statut")}
        <input list="planche-versions-statuts" value={statut} disabled={lecture} onChange={(e) => setStatut(e.target.value)} onBlur={valider} onKeyDown={(e) => { arreter(e); if (e.key === "Enter") valider(); }} data-planche-versions-statut />
        <datalist id="planche-versions-statuts">{statuts.map((s) => <option key={s} value={s} />)}</datalist>
      </label>
      <label className="planche-accrochage-champ">
        {t("planche.version.indice")}
        <input value={indice} disabled={lecture} onChange={(e) => setIndice(e.target.value)} onBlur={valider} onKeyDown={(e) => { arreter(e); if (e.key === "Enter") valider(); }} data-planche-versions-indice />
      </label>
      <p className="inspecteur-aide">{t("planche.version.statuts.note")}</p>
      <label className="planche-accrochage-champ">
        {t("planche.version.nom-jalon")}
        <input value={nom} disabled={lecture} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => { arreter(e); if (e.key === "Enter" && nom.trim()) { onPoserJalon(nom); setNom(""); } }} data-planche-versions-nom />
      </label>
      <div className="planche-debit-barre planche-gabarit-barre" role="toolbar" aria-label={t("planche.version.versions")}>
        <BoutonVersion id="poser-jalon" libelle={t("planche.version.poser-jalon")} principal d={nom.trim() ? disponibilite("poser-jalon") : { disponible: false, motif: "planche.version.jalon-nom-requis" }} onClick={() => { onPoserJalon(nom); setNom(""); }} attribut="data-planche-versions-poser" />
        <button type="button" disabled={!jalon} onClick={() => jalon && onDeriver(jalon)} data-planche-versions-deriver>{t("planche.version.deriver")}</button>
      </div>
      <h4>{t("planche.version.jalons")}</h4>
      {jalons.length === 0 && <p className="inspecteur-aide">{t("planche.version.aucun-jalon")}</p>}
      <ul className="planche-versions-liste" data-planche-versions-jalons>
        {jalons.map((j) => (
          <li key={j.id} className={j.id === jalon?.id ? "planche-versions-choisi" : undefined} data-planche-versions-jalon={j.id}>
            <button type="button" className="planche-versions-ligne" aria-pressed={j.id === jalon?.id} onClick={() => onChoisir(j.id)}>
              <span>
                <b>{j.nom}</b>
                <small>{dateCourte(j.date)} · {t("planche.version.empreinte", { empreinte: empreinteCourte(j.empreinte) })}</small>
              </span>
              <span>{j.statut || t("planche.version.non-renseigne")}</span>
              <b className="planche-versions-indice">{j.indice || "—"}</b>
            </button>
          </li>
        ))}
        {variantes.map((v) => (
          <li key={v.id} data-planche-versions-variante={v.id}>
            <span className="planche-versions-ligne">
              <span>
                <b>{v.nom}</b>
                <small>{dateCourte(v.creeA)}{v.jalon ? ` · ${t("planche.version.derivee", { nom: nomJalon(v.jalon) ?? v.jalon })}` : ""}</small>
              </span>
            </span>
          </li>
        ))}
      </ul>
      <h4>{t("planche.version.registre")}</h4>
      {emissions.length === 0 && <p className="inspecteur-aide">{t("planche.version.aucune-emission")}</p>}
      <ul className="planche-versions-registre" data-planche-versions-registre>
        {emissions.map((e) => (
          <li key={e.id} data-planche-versions-emission={e.id}>
            <span>
              {dateCourte(e.date)} · {e.jalon ?? t("planche.version.etat-courant")}{e.indice ? ` (${e.indice})` : ""} · {e.format} · {t(`planche.version.genre.${e.genre}`)}
            </span>
            <input
              aria-label={t("planche.version.destinataire")}
              placeholder={t("planche.version.non-renseigne")}
              defaultValue={e.destinataire ?? ""}
              disabled={lecture}
              onBlur={(x) => { if ((x.target.value.trim() || null) !== e.destinataire) onDestinataire(e.id, x.target.value); }}
              onKeyDown={arreter}
              data-planche-versions-destinataire
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface ChoixComparaison {
  readonly id: string;
  readonly libelle: string;
}

const COULEUR_ETAT: Readonly<Record<ObjetCompare["etat"], string>> = { ajoute: "planche-diff-ajoute", supprime: "planche-diff-supprime", modifie: "planche-diff-modifie" };

export function PanneauComparer({
  choix,
  depuis,
  vers,
  onDepuis,
  onVers,
  comparaison,
  refus,
  surligner,
  onSurligner,
}: {
  choix: readonly ChoixComparaison[];
  depuis: string;
  vers: string;
  onDepuis: (id: string) => void;
  onVers: (id: string) => void;
  comparaison: Comparaison | null;
  refus: string | null;
  surligner: boolean;
  onSurligner: (v: boolean) => void;
}) {
  const objets = comparaison ? [...comparaison.ajoutes, ...comparaison.supprimes, ...comparaison.modifies] : [];
  const libre = comparaison?.geometrieLibre;
  return (
    <div className="planche-accrochage planche-versions" data-planche-comparer>
      <label className="planche-accrochage-champ">
        {t("planche.comparer.depuis")}
        <select value={depuis} onChange={(e) => onDepuis(e.target.value)} onKeyDown={arreter} data-planche-comparer-depuis>
          {choix.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
        </select>
      </label>
      <label className="planche-accrochage-champ">
        {t("planche.comparer.vers")}
        <select value={vers} onChange={(e) => onVers(e.target.value)} onKeyDown={arreter} data-planche-comparer-vers>
          {choix.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
        </select>
      </label>
      <p className="inspecteur-aide">{t("planche.comparer.note")}</p>
      {refus && <p className="planche-echange-avertissement" role="alert" data-planche-comparer-refus>{refus}</p>}
      {comparaison && (
        <>
          <h4>{t("planche.comparer.differences")}</h4>
          <dl className="planche-accrochage-genres" data-planche-comparer-resume>
            {(["ajoutes", "supprimes", "modifies"] as const).map((k) => (
              <div className="planche-accrochage-ligne" key={k}>
                <dt><span className={`planche-diff-pastille ${COULEUR_ETAT[k === "ajoutes" ? "ajoute" : k === "supprimes" ? "supprime" : "modifie"]}`} /> {t(`planche.comparer.${k}`)}</dt>
                <dd data-planche-comparer-compte={k}>{comparaison[k].length}</dd>
              </div>
            ))}
          </dl>
          {libre && libre.ajoutees + libre.supprimees + libre.modifiees > 0 && <p className="inspecteur-aide" data-planche-comparer-libre>{t("planche.comparer.libre", { ajoutees: String(libre.ajoutees), supprimees: String(libre.supprimees), modifiees: String(libre.modifiees) })}</p>}
          <h4>{t("planche.comparer.objets")}</h4>
          {objets.length === 0 && <p className="inspecteur-aide">{t("planche.comparer.aucune")}</p>}
          <ul className="planche-versions-registre" data-planche-comparer-objets>
            {objets.map((o) => (
              <li key={`${o.etat}-${o.id}`} data-planche-comparer-objet={o.etat}>
                <span>
                  {o.nom} <small>{t(`planche.comparer.etat.${o.etat}`)}{o.aspects.length ? ` · ${o.aspects.map((a) => t(`planche.comparer.aspect.${a}`)).join(", ")}` : ""}</small>
                </span>
              </li>
            ))}
          </ul>
          <label className="planche-echange-case">
            <input type="checkbox" checked={surligner} onChange={(e) => onSurligner(e.target.checked)} data-planche-comparer-surligner /> {t("planche.comparer.surligner")}
          </label>
          <p className="inspecteur-aide">{t("planche.comparer.note-regle")}</p>
        </>
      )}
    </div>
  );
}

export interface EtatBrouillon {
  readonly original: string;
  readonly commence: string;
  readonly ajoutes: number;
  readonly modifies: number;
  readonly supprimes: number;
}

export function PanneauBrouillon({
  brouillon,
  nomPlanche,
  lecture,
  onEssayer,
  onAppliquer,
  onGarder,
  onAbandonner,
  variantes,
  nomJalon,
  onOuvrir,
  disponibilite,
}: {
  brouillon: EtatBrouillon | null;
  nomPlanche: string;
  lecture: boolean;
  onEssayer: () => void;
  onAppliquer: () => void;
  onGarder: () => void;
  onAbandonner: () => void;
  variantes: readonly VarianteAffichee[];
  nomJalon: (id: string) => string;
  onOuvrir: (id: string) => void;
  disponibilite: (id: IdCommandeVersion) => Disponibilite;
}) {
  return (
    <div className="planche-accrochage planche-versions" data-planche-brouillon>
      {brouillon ? (
        <>
          <dl className="planche-accrochage-genres" data-planche-brouillon-etat>
            <div className="planche-accrochage-ligne"><dt>{t("planche.brouillon.original")}</dt><dd>{brouillon.original}</dd></div>
            <div className="planche-accrochage-ligne"><dt>{t("planche.brouillon.commence")}</dt><dd>{dateCourte(brouillon.commence)}</dd></div>
            <div className="planche-accrochage-ligne"><dt>{t("planche.brouillon.changements")}</dt><dd data-planche-brouillon-changements>{t("planche.brouillon.resume", { ajoutes: String(brouillon.ajoutes), modifies: String(brouillon.modifies), supprimes: String(brouillon.supprimes) })}</dd></div>
          </dl>
          <div className="planche-debit-barre planche-gabarit-barre" role="toolbar" aria-label={t("panneau.brouillon")}>
            <BoutonVersion id="appliquer-brouillon" libelle={t("planche.brouillon.appliquer")} principal d={disponibilite("appliquer-brouillon")} onClick={onAppliquer} attribut="data-planche-brouillon-appliquer" />
            <BoutonVersion id="garder-brouillon" libelle={t("planche.brouillon.garder")} d={disponibilite("garder-brouillon")} onClick={onGarder} attribut="data-planche-brouillon-garder" />
            <BoutonVersion id="abandonner-brouillon" libelle={t("planche.brouillon.abandonner")} d={disponibilite("abandonner-brouillon")} onClick={onAbandonner} attribut="data-planche-brouillon-abandonner" />
          </div>
        </>
      ) : (
        <>
          <p className="inspecteur-aide">{t("planche.brouillon.note")}</p>
          <div className="planche-debit-barre planche-gabarit-barre" role="toolbar" aria-label={t("panneau.brouillon")}>
            <BoutonVersion id="brouillon" libelle={t("planche.brouillon.essayer")} principal d={lecture ? { disponible: false, motif: "planche.debit.motif.lecture" } : { disponible: true, motif: null }} onClick={onEssayer} attribut="data-planche-brouillon-essayer" />
          </div>
        </>
      )}
      <h4>{t("planche.brouillon.variantes", { nom: brouillon?.original ?? nomPlanche })}</h4>
      {variantes.length === 0 && <p className="inspecteur-aide">{t("planche.brouillon.aucune-variante")}</p>}
      <ul className="planche-versions-registre" data-planche-brouillon-variantes>
        {variantes.map((v) => (
          <li key={v.id} data-planche-brouillon-variante={v.id}>
            <button type="button" className="planche-lien-bouton" onClick={() => onOuvrir(v.id)}>{v.nom}</button>
            <small>{v.jalon ? t("planche.brouillon.depuis-jalon", { jalon: nomJalon(v.jalon) }) : t("planche.brouillon.depuis-etat", { date: dateCourte(v.creeA).slice(0, 10) })}</small>
          </li>
        ))}
      </ul>
      <p className="inspecteur-aide">{t("planche.brouillon.note-variante")}</p>
    </div>
  );
}

const LIBELLE_CHAMP: Readonly<Record<ChampFiche, CleMessage>> = {
  projet: "planche.fiche.projet",
  numero: "planche.fiche.numero",
  maitreOuvrage: "planche.fiche.maitreOuvrage",
  adresse: "planche.fiche.adresse",
  parcelle: "planche.fiche.parcelle",
  auteur: "planche.fiche.auteur",
};

export function PanneauFicheProjet({ fiche, lecture, onFiche }: { fiche: FicheProjet; lecture: boolean; onFiche: (f: FicheProjet) => void }) {
  const [brouillon, setBrouillon] = useState<FicheProjet>(fiche);
  useEffect(() => setBrouillon(fiche), [fiche]);
  const valider = () => {
    if (CHAMPS_FICHE.some((c) => (brouillon[c] ?? "").trim() !== (fiche[c] ?? ""))) onFiche(brouillon);
  };
  return (
    <div className="planche-accrochage planche-versions" data-planche-fiche>
      <p className="inspecteur-aide">{t("planche.fiche.note")}</p>
      {CHAMPS_FICHE.map((c) => (
        <label className="planche-accrochage-champ" key={c}>
          {t(LIBELLE_CHAMP[c])}
          <input
            value={brouillon[c] ?? ""}
            placeholder={t("planche.version.non-renseigne")}
            className={brouillon[c] ? undefined : "planche-fiche-vide"}
            disabled={lecture}
            onChange={(e) => setBrouillon({ ...brouillon, [c]: e.target.value })}
            onBlur={valider}
            onKeyDown={(e) => { arreter(e); if (e.key === "Enter") valider(); }}
            data-planche-fiche-champ={c}
          />
        </label>
      ))}
      <h4>{t("planche.fiche.reprise")}</h4>
      <ul className="planche-versions-registre">
        <li>{t("planche.fiche.reprise.ifc")}</li>
        <li>{t("planche.fiche.reprise.plan")}</li>
        <li>{t("planche.fiche.reprise.jalons")}</li>
      </ul>
      <p className="inspecteur-aide">{t("planche.fiche.note-fin")}</p>
    </div>
  );
}
