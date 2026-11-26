/**
 * Panneau « Composant dynamique » (extension, 25 novembre 2026 ; d'après les Dynamic Components de SketchUp). Pour le
 * composant sélectionné : ses **options** (ce que l'utilisateur choisit), puis, repliés, ses **paramètres** (valeur ou
 * formule, montrés ou non comme option), les **règles** de ses objets contenus (X, Y, Z, LenX, LenY, LenZ, RotX, RotY,
 * RotZ, Hidden, Material, Copies ; une formule lit « Parent! » ou un autre objet, « Pied!LenZ ») et son action **au clic**
 * (SET / ALTER, déclenchée par l'outil Interagir — phase 1, lot 1). Chaque changement est une opération de la Planche
 * (Annuler). Aucun code : des formules.
 */
import { ATTRIBUTS_DYNAMIQUES, type AttributDynamique, type ComposantDynamique, type ErreurDynamique, type Id, type Modele, type ParametreDynamique, estComposantDynamique, evaluerParametres, nomParametreValide, nombreInstances, objetsPilotables } from "@parcours/sandbox-planche-model";
import { useState } from "react";
import { LOCALE } from "../../../lib/i18n";
import { type CleMessage, t } from "../messages";
import { IconeSandbox, Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_DYNAMIQUE, type Disponibilite, type IdCommandeDynamique } from "./commandes-objets";
import { afficherRaccourci } from "./outils-planche";

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();
const VIDE: ComposantDynamique = { parametres: [], regles: [] };

/** « Chêne=chene ; Hêtre=hetre » ↔ liste de choix ; un choix sans « = » vaut son libellé. */
export function lireChoix(saisie: string): { libelle: string; valeur: string }[] {
  return saisie
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const i = x.indexOf("=");
      return i < 0 ? { libelle: x, valeur: x } : { libelle: x.slice(0, i).trim(), valeur: x.slice(i + 1).trim() };
    });
}
export const ecrireChoix = (choix: readonly { libelle: string; valeur: string }[]): string => choix.map((c) => (c.libelle === c.valeur ? c.libelle : `${c.libelle}=${c.valeur}`)).join(" ; ");

/** Champ validé à la sortie ou par Entrée : la frappe n'atteint pas les raccourcis de la Planche. */
function Champ({ valeur, onValider, ...attrs }: { valeur: string; onValider: (v: string) => void } & Record<string, unknown>) {
  return (
    <input
      key={valeur}
      defaultValue={valeur}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      onBlur={(e) => {
        if (e.target.value !== valeur) onValider(e.target.value);
      }}
      {...attrs}
    />
  );
}

export function PanneauDynamique({
  modele,
  definition,
  erreurs,
  lecture,
  onDefinir: poser,
  onOption,
  executer,
  disponibilite,
}: {
  modele: Modele;
  /** Définition du composant sélectionné seul, ou `null`. */
  definition: Id | null;
  erreurs: readonly ErreurDynamique[];
  lecture: boolean;
  onDefinir: (dyn: ComposantDynamique | null) => void;
  onOption: (nom: string, valeur: string) => void;
  executer: (id: IdCommandeDynamique) => void;
  disponibilite: (id: IdCommandeDynamique) => Disponibilite;
}) {
  const [refus, setRefus] = useState(false);
  const [horsLimites, setHorsLimites] = useState(false);
  /** Une description que la relecture de la Planche refuserait (trop longue, trop d'entrées) n'est pas enregistrée. */
  const onDefinir = (d: ComposantDynamique | null) => {
    const refusee = d !== null && !estComposantDynamique(d);
    setHorsLimites(refusee);
    if (!refusee) poser(d);
  };
  const [nouvelle, setNouvelle] = useState<{ objet: string; attribut: AttributDynamique }>({ objet: "", attribut: "LenX" });
  const def = definition ? modele.definitions[definition] : undefined;
  if (!def) return <p className="inspecteur-aide" data-planche-dynamique-aucun>{t("planche.dynamique.aucun")}</p>;
  const dyn = def.dynamique;
  if (!dyn) {
    return (
      <div className="planche-controle" data-planche-dynamique="ordinaire">
        <p className="inspecteur-aide">{t("planche.dynamique.rendre.aide")}</p>
        <div className="planche-debit-barre">
          <button type="button" disabled={lecture} onClick={() => onDefinir(VIDE)} data-planche-dynamique-rendre>{t("planche.dynamique.rendre")}</button>
        </div>
      </div>
    );
  }
  const valeurs = evaluerParametres(dyn).valeurs;
  const objets = objetsPilotables(modele, def.id);
  const nomObjet = (id: Id): string => {
    const o = objets.find((x) => x.id === id);
    return o ? `${o.nom ?? modele.definitions[o.definition]?.nom ?? id} (${id})` : id;
  };
  const instances = nombreInstances(modele, def.id);
  const majParametre = (i: number, p: ParametreDynamique | null) => onDefinir({ ...dyn, parametres: p ? dyn.parametres.map((x, k) => (k === i ? p : x)) : dyn.parametres.filter((_, k) => k !== i) });
  const renommer = (i: number, nom: string) => {
    const ok = nomParametreValide(nom) && !dyn.parametres.some((x, k) => k !== i && x.nom.toLowerCase() === nom.toLowerCase());
    setRefus(!ok);
    if (ok) majParametre(i, { ...(dyn.parametres[i] as ParametreDynamique), nom });
  };
  const ajouterParametre = () => {
    let k = dyn.parametres.length + 1;
    while (dyn.parametres.some((p) => p.nom.toLowerCase() === `parametre${k}`)) k++;
    onDefinir({ ...dyn, parametres: [...dyn.parametres, { nom: `Parametre${k}`, valeur: "1" }] });
  };
  const affiche = (v: number | string | undefined): string => (v === undefined ? "—" : typeof v === "number" ? v.toLocaleString(LOCALE, { maximumFractionDigits: 4 }) : v);
  const options = dyn.parametres.filter((p) => p.option);
  const objetChoisi = objets.some((o) => o.id === nouvelle.objet) ? nouvelle.objet : (objets[0]?.id ?? "");
  return (
    <div className="planche-controle planche-dynamique" data-planche-dynamique="dynamique">
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.dynamique.barre")}>
        {COMMANDES_DYNAMIQUE.filter((c) => c.id !== "composant-dynamique").map((c) => {
          const d = disponibilite(c.id);
          return (
            <button key={c.id} type="button" disabled={!d.disponible} title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`} aria-label={t(c.libelle)} onClick={() => executer(c.id)} data-planche-commande={c.id}>
              <Pictogramme picto={c.picto} /> {t(c.court)}
            </button>
          );
        })}
      </div>
      {instances > 1 && <p className="inspecteur-aide" data-planche-dynamique-partage>{t("planche.dynamique.partage", { n: String(instances) })}</p>}
      <h4>{t("planche.dynamique.options")}</h4>
      {options.length === 0 ? (
        <p className="inspecteur-aide">{t("planche.dynamique.options.aucune")}</p>
      ) : (
        <div className="planche-debit-reglages" data-planche-dynamique-options>
          {options.map((p) => (
            <label key={p.nom} className="planche-debit-champ">
              <span>{p.option!.libelle || p.nom}</span>
              {p.option!.choix?.length ? (
                <select value={p.valeur} disabled={lecture} onKeyDown={arreter} onChange={(e) => onOption(p.nom, e.target.value)} data-planche-dynamique-option={p.nom}>
                  {!p.option!.choix.some((c) => c.valeur === p.valeur) && <option value={p.valeur}>{p.valeur}</option>}
                  {p.option!.choix.map((c) => <option key={c.valeur} value={c.valeur}>{c.libelle}</option>)}
                </select>
              ) : (
                <Champ valeur={p.valeur} onValider={(v) => onOption(p.nom, v)} disabled={lecture} maxLength={500} data-planche-dynamique-option={p.nom} />
              )}
            </label>
          ))}
        </div>
      )}
      {erreurs.length > 0 && (
        <div role="alert" data-planche-dynamique-erreurs>
          <h4>{t("planche.dynamique.erreurs")}</h4>
          <ul className="planche-dynamique-erreurs">
            {erreurs.map((e, i) => <li key={i} data-planche-dynamique-erreur={e.cle}><strong>{e.ou}</strong> : {t(`planche.dynamique.erreur.${e.cle}` as CleMessage, e.args)}</li>)}
          </ul>
        </div>
      )}
      <details className="planche-dynamique-bloc" data-planche-dynamique-parametres>
        <summary>{t("planche.dynamique.parametres")} ({dyn.parametres.length})</summary>
        {dyn.parametres.map((p, i) => (
          <fieldset key={`${i}:${p.nom}`} className="planche-dynamique-parametre" disabled={lecture} data-planche-dynamique-parametre={p.nom}>
            <div className="planche-dynamique-ligne">
              <Champ valeur={p.nom} onValider={(v) => renommer(i, v.trim())} aria-label={t("planche.dynamique.parametre.nom")} data-planche-dynamique-nom="" />
              <Champ valeur={p.valeur} onValider={(v) => majParametre(i, { ...p, valeur: v })} aria-label={t("planche.dynamique.parametre.valeur")} placeholder={t("planche.dynamique.parametre.valeur")} maxLength={500} data-planche-dynamique-valeur="" />
              <button type="button" onClick={() => majParametre(i, null)} aria-label={t("planche.dynamique.parametre.retirer", { nom: p.nom })} title={t("planche.dynamique.parametre.retirer", { nom: p.nom })}><IconeSandbox nom="fermer" /></button>
            </div>
            <small data-planche-dynamique-vaut={p.nom}>{t("planche.dynamique.vaut", { valeur: affiche(valeurs[p.nom]) })}</small>
            <label className="planche-dynamique-coche">
              <input type="checkbox" checked={p.option !== undefined} onKeyDown={arreter} onChange={(e) => { const { option: _o, ...sans } = p; majParametre(i, e.target.checked ? { ...p, option: { libelle: p.nom } } : sans); }} data-planche-dynamique-exposer="" />
              <span>{t("planche.dynamique.parametre.option")}</span>
            </label>
            {p.option && (
              <div className="planche-dynamique-ligne">
                <Champ valeur={p.option.libelle} onValider={(v) => majParametre(i, { ...p, option: { ...p.option!, libelle: v } })} aria-label={t("planche.dynamique.parametre.libelle")} maxLength={80} placeholder={t("planche.dynamique.parametre.libelle")} />
                <Champ
                  valeur={ecrireChoix(p.option.choix ?? [])}
                  onValider={(v) => { const choix = lireChoix(v); majParametre(i, { ...p, option: choix.length ? { libelle: p.option!.libelle, choix } : { libelle: p.option!.libelle } }); }}
                  aria-label={t("planche.dynamique.parametre.choix")}
                  placeholder={t("planche.dynamique.parametre.choix")}
                  data-planche-dynamique-choix=""
                />
              </div>
            )}
          </fieldset>
        ))}
        {refus && <p className="inspecteur-aide" role="alert">{t("planche.dynamique.parametre.invalide")}</p>}
        {horsLimites && <p className="inspecteur-aide" role="alert" data-planche-dynamique-limites>{t("planche.dynamique.erreur.limites")}</p>}
        <div className="planche-debit-barre">
          <button type="button" disabled={lecture || dyn.parametres.length >= 64} onClick={ajouterParametre} data-planche-dynamique-ajouter-parametre>{t("planche.dynamique.parametre.ajouter")}</button>
        </div>
      </details>
      <details className="planche-dynamique-bloc" data-planche-dynamique-regles>
        <summary>{t("planche.dynamique.regles")} ({dyn.regles.length})</summary>
        {dyn.regles.map((r, i) => (
          <div key={`${r.objet}:${r.attribut}`} className="planche-dynamique-ligne" data-planche-dynamique-regle={`${r.objet}:${r.attribut}`}>
            <span className="planche-dynamique-cible">{nomObjet(r.objet)} · <strong>{r.attribut}</strong></span>
            <Champ valeur={r.formule} onValider={(v) => onDefinir({ ...dyn, regles: dyn.regles.map((x, k) => (k === i ? { ...x, formule: v } : x)) })} disabled={lecture} maxLength={500} aria-label={t("planche.dynamique.regle.formule")} />
            <button type="button" disabled={lecture} onClick={() => onDefinir({ ...dyn, regles: dyn.regles.filter((_, k) => k !== i) })} aria-label={t("planche.dynamique.regle.retirer", { attribut: r.attribut, objet: nomObjet(r.objet) })} title={t("planche.dynamique.regle.retirer", { attribut: r.attribut, objet: nomObjet(r.objet) })}><IconeSandbox nom="fermer" /></button>
          </div>
        ))}
        {objets.length === 0 ? (
          <p className="inspecteur-aide">{t("planche.dynamique.regles.aucun-objet")}</p>
        ) : (
          <div className="planche-dynamique-ligne">
            <select value={objetChoisi} disabled={lecture} onKeyDown={arreter} onChange={(e) => setNouvelle({ ...nouvelle, objet: e.target.value })} aria-label={t("planche.dynamique.regle.objet")} data-planche-dynamique-regle-objet>
              {objets.map((o) => <option key={o.id} value={o.id}>{nomObjet(o.id)}</option>)}
            </select>
            <select value={nouvelle.attribut} disabled={lecture} onKeyDown={arreter} onChange={(e) => setNouvelle({ ...nouvelle, attribut: e.target.value as AttributDynamique })} aria-label={t("planche.dynamique.regle.attribut")} data-planche-dynamique-regle-attribut>
              {ATTRIBUTS_DYNAMIQUES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <button type="button" disabled={lecture || dyn.regles.length >= 512 || dyn.regles.some((r) => r.objet === objetChoisi && r.attribut === nouvelle.attribut)} onClick={() => onDefinir({ ...dyn, regles: [...dyn.regles, { objet: objetChoisi, attribut: nouvelle.attribut, formule: nouvelle.attribut === "Copies" || nouvelle.attribut === "Hidden" ? "0" : nouvelle.attribut === "Material" ? "" : "=" }] })} data-planche-dynamique-ajouter-regle>
              {t("planche.dynamique.regle.ajouter")}
            </button>
          </div>
        )}
      </details>
      <details className="planche-dynamique-bloc" data-planche-dynamique-clic open={dyn.surClic ? true : undefined}>
        <summary>{t("planche.dynamique.clic")}</summary>
        <p className="inspecteur-aide">{t("planche.dynamique.clic.aide")}</p>
        <Champ
          valeur={dyn.surClic ?? ""}
          onValider={(v) => {
            const { surClic: _s, ...sans } = dyn;
            onDefinir(v.trim() ? { ...dyn, surClic: v.trim() } : sans);
          }}
          disabled={lecture}
          maxLength={500}
          aria-label={t("planche.dynamique.clic")}
          placeholder={'ALTER("Ouverture", 0, 90)'}
          data-planche-dynamique-surclic=""
        />
      </details>
      <div className="planche-debit-barre">
        <button type="button" disabled={lecture} onClick={() => onDefinir(null)} data-planche-dynamique-retirer>{t("planche.dynamique.retirer")}</button>
      </div>
    </div>
  );
}
