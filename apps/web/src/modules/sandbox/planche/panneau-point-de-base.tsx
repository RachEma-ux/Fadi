/**
 * Section « Point de base du projet » du panneau Emplacement (cas 4 du catalogue des extensions, étape 2 : D6-F8-001 ;
 * maquette `analyses/catalogue-extensions/cas-4/maquettes/etape-2-point-de-base.png`) : coordonnées projetées E, N de
 * l'origine du dessin, systèmes déclarés, rotation du projet ; H est le niveau de référence (étape 1), jamais saisi deux
 * fois. Contrôle d'aller-retour sur un point de contrôle. Aucune projection n'est calculée ni supposée.
 */
import { type ChampPointDeBase, type PointDeBase, controleAllerRetour, lireNombreSaisi, lirePointDeBase, texteCoordonnee } from "@parcours/sandbox-planche-model";
import { useEffect, useState } from "react";
import { LANGUE_INTERFACE, t } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_EMPLACEMENT } from "./commandes-objets";
import { afficherRaccourci } from "./outils-planche";

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();
const separateur = (): "," | "." => (LANGUE_INTERFACE === "en" ? "." : ",");
const coord = (v: number | undefined): string => (v === undefined ? "" : texteCoordonnee(v, separateur()));
const saisieDe = (p: PointDeBase | null) => ({ e: coord(p?.e), n: coord(p?.n), systeme: p?.systeme ?? "", systemeVertical: p?.systemeVertical ?? "", rotation: p ? String(p.rotation).replace(".", separateur()) : "0" });
const CHAMPS = ["e", "n", "systeme", "systemeVertical", "rotation"] as const;
const COMMANDE = COMMANDES_EMPLACEMENT.find((c) => c.id === "point-de-base")!;

export function SectionPointDeBase({
  point,
  reference,
  lecture,
  onEnregistrer,
  note,
}: {
  point: PointDeBase | null;
  /** Niveau de référence de la Planche (NGF du ±0,00) ; `null` = non déclaré. */
  reference: number | null;
  lecture: boolean;
  onEnregistrer: (p: PointDeBase | null) => void;
  note: string | null;
}) {
  const [saisie, setSaisie] = useState(() => saisieDe(point));
  const [erreur, setErreur] = useState<ChampPointDeBase | null>(null);
  const [controle, setControle] = useState({ e: "", n: "", h: "" });
  // Le point a changé ailleurs (Annuler, Rétablir) : la saisie le suit.
  useEffect(() => {
    setSaisie(saisieDe(point));
    setErreur(null);
  }, [point]);
  const enregistrer = () => {
    const r = lirePointDeBase(saisie);
    if ("erreur" in r) {
      setErreur(r.erreur);
      return;
    }
    setErreur(null);
    onEnregistrer(r.point);
  };
  const ce = lireNombreSaisi(controle.e);
  const cn = lireNombreSaisi(controle.n);
  const ch = lireNombreSaisi(controle.h);
  const resultat = point && ce !== null && cn !== null && ch !== null ? controleAllerRetour(point, { e: ce, n: cn, h: ch }, reference) : null;
  const metre = (v: number) => v.toFixed(3).replace(".", separateur());
  return (
    <section className="planche-point-de-base" data-planche-point-de-base={point ? "declare" : "absent"}>
      <h4>
        <Pictogramme picto={COMMANDE.picto} /> {t("planche.point-de-base.titre")} <small>{afficherRaccourci(COMMANDE.raccourci)}</small>
      </h4>
      <p className="inspecteur-aide">{t("planche.point-de-base.aide")}</p>
      {!point && <p className="inspecteur-aide" data-planche-point-de-base-absent>{t("planche.point-de-base.absent")}</p>}
      <div className="planche-debit-reglages planche-point-de-base-formulaire">
        {CHAMPS.slice(0, 2).map(champ)}
        <label className="planche-debit-champ">
          <span>{t("planche.point-de-base.h")}</span>
          <span className="planche-point-de-base-h" data-planche-point-de-base-h={reference === null ? "non-evaluee" : reference}>{reference === null ? t("planche.point-de-base.h.absent") : `${reference.toFixed(2).replace(".", separateur())} m`}</span>
        </label>
        {CHAMPS.slice(2).map(champ)}
      </div>
      {erreur && <p className="inspecteur-aide" role="alert" data-planche-point-de-base-erreur={erreur}>{t(`planche.point-de-base.erreur.${erreur}`)}</p>}
      <div className="planche-debit-barre">
        <button type="button" className="est-principal" disabled={lecture} onClick={enregistrer} data-planche-point-de-base-enregistrer>{t("planche.point-de-base.enregistrer")}</button>
        <button type="button" disabled={lecture || !point} onClick={() => onEnregistrer(null)} data-planche-point-de-base-retirer>{t("planche.point-de-base.retirer")}</button>
      </div>
      <h4>{t("planche.point-de-base.controle")}</h4>
      <div className="planche-debit-reglages planche-point-de-base-formulaire">
        {(["e", "n", "h"] as const).map((c) => (
          <label key={c} className="planche-debit-champ">
            <span>{t(`planche.point-de-base.controle.${c}`)}</span>
            <input value={controle[c]} inputMode="decimal" onKeyDown={arreter} onChange={(ev) => setControle({ ...controle, [c]: ev.target.value })} data-planche-point-de-base-controle={c} />
          </label>
        ))}
      </div>
      <p className="inspecteur-aide" role="status" data-planche-point-de-base-resultat={resultat ? resultat.ecart * 1000 : ce !== null && cn !== null && ch !== null ? "non-evalue" : "attente"}>
        {resultat ? (
          <>
            {t("planche.point-de-base.controle.dessin")} <b>x {metre(resultat.dessin.x)}</b> · <b>y {metre(resultat.dessin.y)}</b> · <b>z {metre(resultat.dessin.z)}</b> — <b>{t("planche.point-de-base.controle.ecart", { ecart: (resultat.ecart * 1000).toFixed(1).replace(".", separateur()) })}</b>
          </>
        ) : ce !== null && cn !== null && ch !== null ? (
          t("planche.point-de-base.controle.non-evalue")
        ) : (
          t("planche.point-de-base.controle.attente")
        )}
      </p>
      <p className="inspecteur-aide">{t("planche.point-de-base.note")}</p>
      {note && <p className="inspecteur-aide" role="status" data-planche-point-de-base-note>{note}</p>}
    </section>
  );

  // Fonction de rendu (pas un composant) : les champs gardent le focus pendant la frappe.
  function champ(c: (typeof CHAMPS)[number]) {
    const exemple = c === "systeme" || c === "systemeVertical" ? t(`planche.point-de-base.exemple.${c}`) : undefined;
    return (
      <label key={c} className="planche-debit-champ">
        <span>{t(`planche.point-de-base.${c}`)}</span>
        <input value={saisie[c]} disabled={lecture} placeholder={exemple} inputMode={c === "systeme" || c === "systemeVertical" ? "text" : "decimal"} aria-invalid={erreur === c} onKeyDown={(ev) => { arreter(ev); if (ev.key === "Enter") enregistrer(); }} onChange={(ev) => setSaisie({ ...saisie, [c]: ev.target.value })} data-planche-point-de-base-champ={c} />
      </label>
    );
  }
}
