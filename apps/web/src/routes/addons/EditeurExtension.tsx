/**
 * Éditeur d'une extension ajoutée à la plateforme (image 15, validée le 26 novembre 2026) : le même écran sert à
 * créer, à modifier et à corriger un fichier que l'import a refusé. Une extension est du texte — une fiche, des
 * commandes, du code. Le code n'est jamais exécuté ici : il est seulement lu, pour signaler une erreur d'écriture.
 * « Enregistrer » reste grisé tant qu'un contrôle est en rouge ; le serveur rejuge le paquet à l'enregistrement.
 */
import { useMemo, useState, type ReactNode } from "react";
import {
  PERMISSIONS_EXTENSION, controlesPaquet, controlesReussis, imageIcone,
  type ControlePaquet, type EntreeDeclaree, type PaquetExtension, type PermissionExtension,
} from "@parcours/sandbox-planche-model";
import { telechargerPaquet } from "../../lib/addons";
import { t } from "../../modules/sandbox/messages";

/** Lit le code sans l'exécuter : `null` s'il s'écrit correctement, sinon le message de l'erreur. */
export function erreurEcritureCode(code: string): string | null {
  try {
    // Construire la fonction ne l'appelle pas : seul l'analyseur du navigateur lit le texte. Même forme que le
    // chargement d'une extension (`creerExecutantExtension`) : fonction ordinaire, en mode strict.
    new Function("planche", `"use strict";\n${code}`);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

function texteControle(c: ControlePaquet): string {
  if (c.genre === "fiche") return c.ok ? t("extensions.admin.controle.fiche.ok") : t("extensions.admin.controle.fiche.non", { detail: c.detail });
  if (c.genre === "commandes") return c.ok ? t("extensions.admin.controle.commandes.ok", { n: c.detail }) : /^\d+$/.test(c.detail) ? t("extensions.admin.controle.commandes.aucune") : t("extensions.admin.controle.commandes.non", { detail: c.detail });
  if (c.genre === "raccourcis") return c.ok ? t("extensions.admin.controle.raccourcis.ok") : t("extensions.admin.controle.raccourcis.non", { detail: c.detail });
  if (c.genre === "code") return c.ok ? t("extensions.admin.controle.code.ok") : c.detail ? t("extensions.admin.controle.code.non", { detail: c.detail }) : t("extensions.admin.controle.code.vide");
  if (c.genre === "reponse") return t("extensions.admin.controle.reponse.non", { commande: c.commande ?? "", detail: c.detail });
  return t("extensions.admin.controle.paquet.non", { detail: c.detail });
}

const COMMANDE_VIDE: EntreeDeclaree = { id: "", libelle: { fr: "", en: "" }, icone: "", raccourci: "" };

interface Props {
  readonly onglets: ReactNode;
  readonly initial: PaquetExtension;
  /** Création (ou correction d'un fichier refusé) : l'identifiant se saisit ; il ne change plus ensuite. */
  readonly creation: boolean;
  readonly titre: string;
  readonly enCours: boolean;
  readonly erreur: string | null;
  readonly onAnnuler: () => void;
  readonly onEnregistrer: (paquet: PaquetExtension) => void;
}

export function EditeurExtension({ onglets, initial, creation, titre, enCours, erreur, onAnnuler, onEnregistrer }: Props) {
  const [p, setP] = useState<PaquetExtension>(initial);
  /** Commande en cours de saisie : son rang (`-1` = nouvelle), ses champs et le texte de son icône. */
  const [edition, setEdition] = useState<{ rang: number; entree: EntreeDeclaree; svg: string } | null>(null);
  const fiche = (champs: Partial<PaquetExtension["fiche"]>) => setP((x) => ({ ...x, fiche: { ...x.fiche, ...champs } }));
  const controles = useMemo(() => controlesPaquet(p, [], p.code.trim() ? erreurEcritureCode(p.code) : null), [p]);
  const pret = controlesReussis(controles) && edition === null;

  const basculerPermission = (perm: PermissionExtension, active: boolean) =>
    fiche({ permissions: PERMISSIONS_EXTENSION.filter((x) => (x === perm ? active : p.fiche.permissions.includes(x))) });

  const validerCommande = () => {
    if (!edition) return;
    const id = edition.entree.id.trim();
    const page = `${id}.svg`;
    const entree: EntreeDeclaree = { ...edition.entree, id, icone: page, raccourci: edition.entree.raccourci.trim() };
    setP((x) => {
      const ancienne = edition.rang >= 0 ? x.fiche.commandes[edition.rang] : undefined;
      const commandes = edition.rang >= 0 ? x.fiche.commandes.map((c, i) => (i === edition.rang ? entree : c)) : [...x.fiche.commandes, entree];
      const pages = { ...x.pages };
      // L'icône d'avant n'est retirée que si plus rien ne la cite.
      if (ancienne && ancienne.icone !== page && ![...commandes, ...x.fiche.outils, ...x.fiche.panneaux].some((e) => e.icone === ancienne.icone)) delete pages[ancienne.icone];
      pages[page] = edition.svg;
      return { ...x, fiche: { ...x.fiche, commandes }, pages };
    });
    setEdition(null);
  };
  const supprimerCommande = () => {
    if (!edition || edition.rang < 0) return setEdition(null);
    setP((x) => {
      const retiree = x.fiche.commandes[edition.rang]!;
      const commandes = x.fiche.commandes.filter((_, i) => i !== edition.rang);
      const pages = { ...x.pages };
      if (![...commandes, ...x.fiche.outils, ...x.fiche.panneaux].some((e) => e.icone === retiree.icone)) delete pages[retiree.icone];
      return { ...x, fiche: { ...x.fiche, commandes }, pages };
    });
    setEdition(null);
  };

  const champ = (libelle: string, valeur: string, sur: (v: string) => void, options: { nom: string; desactive?: boolean; long?: boolean } ) => (
    <label className="extensions-champ">
      <span>{libelle}</span>
      {options.long
        ? <textarea rows={3} value={valeur} onChange={(e) => sur(e.target.value)} data-editeur-champ={options.nom} />
        : <input type="text" value={valeur} disabled={options.desactive} onChange={(e) => sur(e.target.value)} data-editeur-champ={options.nom} translate="no" />}
    </label>
  );

  return (
    <div data-extensions-editeur translate="no">
      <h1>{titre}</h1>
      <p className="h7-muted">{t("extensions.admin.editeur.intro")}</p>
      {onglets}
      <div className="extensions-editeur">
        <section className="extensions-editeur-volet">
          <h2>{t("extensions.admin.editeur.fiche")}</h2>
          <div className="extensions-champs trois">
            {champ(t("extensions.admin.editeur.identifiant"), p.fiche.id, (v) => fiche({ id: v }), { nom: "id", desactive: !creation })}
            {champ(t("extensions.admin.editeur.version"), p.fiche.version, (v) => fiche({ version: v }), { nom: "version" })}
            {champ(t("extensions.admin.editeur.auteur"), p.fiche.auteur, (v) => fiche({ auteur: v }), { nom: "auteur" })}
          </div>
          <div className="extensions-champs">
            {champ(t("extensions.admin.editeur.nomFr"), p.fiche.nom.fr, (v) => fiche({ nom: { ...p.fiche.nom, fr: v } }), { nom: "nom-fr" })}
            {champ(t("extensions.admin.editeur.nomEn"), p.fiche.nom.en, (v) => fiche({ nom: { ...p.fiche.nom, en: v } }), { nom: "nom-en" })}
            {champ(t("extensions.admin.editeur.descriptionFr"), p.fiche.description.fr, (v) => fiche({ description: { ...p.fiche.description, fr: v } }), { nom: "description-fr", long: true })}
            {champ(t("extensions.admin.editeur.descriptionEn"), p.fiche.description.en, (v) => fiche({ description: { ...p.fiche.description, en: v } }), { nom: "description-en", long: true })}
          </div>
          <fieldset className="extensions-permissions">
            <legend>{t("extensions.admin.editeur.demande")}</legend>
            {PERMISSIONS_EXTENSION.map((perm) => (
              <label key={perm}>
                <input type="checkbox" checked={p.fiche.permissions.includes(perm)} onChange={(e) => basculerPermission(perm, e.target.checked)} data-editeur-permission={perm} />
                {t(`extensions.admin.permission.${perm}`)}
              </label>
            ))}
          </fieldset>
          <h3>{t("extensions.admin.editeur.commandes")}</h3>
          <ul className="extensions-commandes" data-editeur-commandes>
            {p.fiche.commandes.map((c, i) => {
              const image = imageIcone(p, c.icone);
              return (
                <li key={`${c.id}-${i}`} data-editeur-commande={c.id}>
                  <span className="extensions-commande-icone" aria-hidden="true">{image && <img src={image} alt="" width={22} height={22} />}</span>
                  <span className="extensions-commande-texte"><strong>{c.libelle.fr}</strong><small>{c.libelle.en}</small></span>
                  <kbd>{c.raccourci}</kbd>
                  <button type="button" className="button-secondary" onClick={() => setEdition({ rang: i, entree: c, svg: p.pages[c.icone] ?? "" })} data-editeur-commande-modifier>{t("extensions.admin.modifier")}</button>
                </li>
              );
            })}
          </ul>
          {edition && (
            <div className="extensions-commande-saisie" data-editeur-saisie>
              <h4>{t("extensions.admin.editeur.commande.titre")}</h4>
              <div className="extensions-champs">
                {champ(t("extensions.admin.editeur.commande.id"), edition.entree.id, (v) => setEdition({ ...edition, entree: { ...edition.entree, id: v } }), { nom: "commande-id" })}
                {champ(t("extensions.admin.editeur.commande.raccourci"), edition.entree.raccourci, (v) => setEdition({ ...edition, entree: { ...edition.entree, raccourci: v } }), { nom: "commande-raccourci" })}
                {champ(t("extensions.admin.editeur.commande.libelleFr"), edition.entree.libelle.fr, (v) => setEdition({ ...edition, entree: { ...edition.entree, libelle: { ...edition.entree.libelle, fr: v } } }), { nom: "commande-libelle-fr" })}
                {champ(t("extensions.admin.editeur.commande.libelleEn"), edition.entree.libelle.en, (v) => setEdition({ ...edition, entree: { ...edition.entree, libelle: { ...edition.entree.libelle, en: v } } }), { nom: "commande-libelle-en" })}
              </div>
              {champ(t("extensions.admin.editeur.commande.icone"), edition.svg, (v) => setEdition({ ...edition, svg: v }), { nom: "commande-icone", long: true })}
              <div className="extensions-actions">
                <button type="button" className="button-secondary" onClick={() => setEdition(null)}>{t("extensions.admin.annuler")}</button>
                {edition.rang >= 0 && <button type="button" className="button-secondary extensions-danger" onClick={supprimerCommande} data-editeur-commande-supprimer>{t("extensions.admin.editeur.commande.supprimer")}</button>}
                <button type="button" className="button-primary" disabled={edition.entree.id.trim() === ""} onClick={validerCommande} data-editeur-commande-valider>{t("extensions.admin.editeur.commande.valider")}</button>
              </div>
            </div>
          )}
          {!edition && <button type="button" className="button-secondary" onClick={() => setEdition({ rang: -1, entree: COMMANDE_VIDE, svg: "" })} data-editeur-ajouter>{t("extensions.admin.editeur.ajouter")}</button>}
          {p.fiche.outils.length + p.fiche.panneaux.length > 0 && <p className="h7-muted extensions-note">{t("extensions.admin.editeur.autres", { outils: String(p.fiche.outils.length), panneaux: String(p.fiche.panneaux.length) })}</p>}
        </section>
        <section className="extensions-editeur-volet">
          <h2>{t("extensions.admin.editeur.code")}</h2>
          <textarea className="extensions-code" spellCheck={false} value={p.code} onChange={(e) => setP((x) => ({ ...x, code: e.target.value }))} aria-label={t("extensions.admin.editeur.code")} data-editeur-code />
          <h3>{t("extensions.admin.editeur.controle")}</h3>
          <ul className="extensions-controles" data-editeur-controles>
            {controles.map((c, i) => (
              <li key={i} className={c.ok ? "ok" : "non"} data-editeur-controle={c.genre} data-ok={c.ok ? "oui" : "non"}>{c.ok ? "✓" : "✕"} {texteControle(c)}</li>
            ))}
          </ul>
          {erreur && <p role="alert" className="form-error" data-editeur-erreur>{erreur}</p>}
          <div className="extensions-actions">
            <button type="button" className="button-secondary" onClick={onAnnuler} data-editeur-annuler>{t("extensions.admin.annuler")}</button>
            <button type="button" className="button-secondary" onClick={() => telechargerPaquet(p, p.fiche.id)} data-editeur-exporter>{t("extensions.admin.editeur.exporter")}</button>
            <button type="button" className="button-primary" disabled={!pret || enCours} onClick={() => onEnregistrer(p)} data-editeur-enregistrer>{t("extensions.admin.editeur.enregistrer")}</button>
          </div>
        </section>
      </div>
    </div>
  );
}
