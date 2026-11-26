/**
 * Extensions installées dans la Planche (protocole 1.0, lot 3) — ce que la Planche montre pour elles :
 *
 *  - `useExtensionsInstallees` : la liste reçue du serveur à l'ouverture (paquets relus par `lirePaquetsInstalles`) ;
 *    sans réseau ou sans compte, aucune extension installée n'est offerte ;
 *  - `IconeExtension` : l'icône d'une commande, un dessin SVG du paquet affiché comme une **image** (`<img>`) — rien de
 *    ce qu'il contient ne s'exécute ni n'atteint la page ;
 *  - `AvisExtensions` : les avis au-dessus de la barre d'état (demandés par une extension, ou posés par la Planche
 *    quand une commande échoue, dépasse son délai ou ne peut pas démarrer) ;
 *  - `DialogueSaisieExtension` : la fenêtre de saisie demandée par une extension ; la Planche la dessine, l'extension
 *    n'en fournit que les textes et reçoit des valeurs validées (`validerSaisie`).
 *
 * Les textes venus d'une extension sont toujours posés comme du texte, jamais comme du balisage.
 */
import { useEffect, useRef, useState } from "react";
import { lireNombreSaisi, valeursInitiales, validerSaisie, type DemandeSaisie, type PaquetExtension, type ValeursSaisie } from "@parcours/sandbox-planche-model";
import { LANGUE_INTERFACE, t } from "../messages";
import { IconeSandbox } from "../pictogrammes/Pictogramme";
import { lireExtensionsServeur } from "../preferences/client";

/** Texte d'une fiche dans la langue de l'interface. */
export const texteFiche = (x: { readonly fr: string; readonly en: string }): string => (LANGUE_INTERFACE === "en" ? x.en : x.fr);

export function useExtensionsInstallees(): readonly PaquetExtension[] {
  const [paquets, setPaquets] = useState<readonly PaquetExtension[]>([]);
  useEffect(() => {
    let vivant = true;
    lireExtensionsServeur().then(
      (p) => vivant && setPaquets(p),
      () => undefined,
    );
    return () => {
      vivant = false;
    };
  }, []);
  return paquets;
}

export function IconeExtension({ image, className }: { image: string; className?: string }) {
  return <img src={image} alt="" aria-hidden="true" draggable={false} className={`planche-extension-icone${className ? ` ${className}` : ""}`} />;
}

export interface AvisAffiche {
  readonly cle: number;
  /** Nom de l'extension, dans la langue de l'interface. */
  readonly extension: string;
  readonly texte: string;
  /** `arret` : posé par la Planche (échec, délai, démarrage impossible). */
  readonly genre: "info" | "alerte" | "arret";
}

/** Avis encore affichés après l'ajout d'un nouveau : les trois derniers. */
export const MAX_AVIS_AFFICHES = 3;
export const ajouterAvis = (liste: readonly AvisAffiche[], avis: AvisAffiche): readonly AvisAffiche[] => [...liste, avis].slice(-MAX_AVIS_AFFICHES);

export function AvisExtensions({ avis, onFermer }: { avis: readonly AvisAffiche[]; onFermer: (cle: number) => void }) {
  if (avis.length === 0) return null;
  return (
    <div className="planche-avis-extensions" role="region" aria-label={t("extensions.avis.liste")} data-planche-avis-extensions>
      {avis.map((a) => (
        <div key={a.cle} className="planche-avis-extension" role={a.genre === "info" ? "status" : "alert"} data-genre={a.genre} data-planche-avis-extension>
          <IconeSandbox nom="menuExtensions" className="planche-avis-extension-picto" />
          <div className="planche-avis-extension-corps">
            <strong>{a.extension}</strong>
            <div data-planche-avis-texte>{a.texte}</div>
          </div>
          <button type="button" className="planche-avis-extension-fermer" aria-label={t("extensions.avis.fermer")} title={t("extensions.avis.fermer")} onClick={() => onFermer(a.cle)} data-planche-avis-fermer>
            <IconeSandbox nom="fermer" />
          </button>
        </div>
      ))}
    </div>
  );
}

export interface SaisieOuverte {
  readonly cle: number;
  readonly extension: string;
  readonly demande: DemandeSaisie;
  /** Valeurs validées, ou `null` si l'utilisateur annule. */
  readonly repondre: (valeurs: ValeursSaisie | null) => void;
}

/** File des fenêtres de saisie sans celle de clé `cle` ; rend la même file si elle n'y est pas. */
export const retirerSaisie = (file: readonly SaisieOuverte[], cle: number): readonly SaisieOuverte[] => (file.some((x) => x.cle === cle) ? file.filter((x) => x.cle !== cle) : file);

const nombreAffiche = (n: number): string => String(n).replace(".", LANGUE_INTERFACE === "en" ? "." : ",");

export function DialogueSaisieExtension({ saisie }: { saisie: SaisieOuverte }) {
  const { demande } = saisie;
  const [valeurs, setValeurs] = useState<Record<string, string | boolean>>(() => Object.fromEntries(Object.entries(valeursInitiales(demande)).map(([id, v]) => [id, typeof v === "number" ? nombreAffiche(v) : v] as const)));
  const [erreur, setErreur] = useState<string | null>(null);
  const racine = useRef<HTMLFormElement | null>(null);
  useEffect(() => {
    racine.current?.querySelector<HTMLElement>("input, select")?.focus();
  }, []);
  const poser = (id: string, v: string | boolean) => {
    setErreur(null);
    setValeurs((avant) => ({ ...avant, [id]: v }));
  };
  const valider = () => {
    const r = validerSaisie(demande, valeurs);
    if (r.ok) return saisie.repondre(r.valeurs);
    const champ = demande.champs.find((c) => c.id === r.champ)!;
    const borne = champ.genre === "nombre" ? nombreAffiche((r.motif === "min" ? champ.min : champ.max) ?? 0) : "";
    setErreur(t(`extensions.saisie.erreur.${r.motif}`, { champ: champ.libelle, borne }));
    racine.current?.querySelector<HTMLElement>(`[data-saisie-champ="${r.champ}"]`)?.focus();
  };
  return (
    <div className="planche-recherche-fond" onPointerDown={(e) => e.target === e.currentTarget && saisie.repondre(null)}>
      <form
        ref={racine}
        className="planche-recherche planche-dialogue planche-saisie-extension"
        role="dialog"
        aria-modal="true"
        aria-label={demande.titre}
        data-planche-saisie-extension
        onSubmit={(e) => {
          e.preventDefault();
          valider();
        }}
        onKeyDown={(e) => {
          // Rien de ce qu'on tape dans la fenêtre n'atteint le clavier de la Planche.
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            saisie.repondre(null);
          }
        }}
      >
        <h3>{demande.titre}</h3>
        <p className="inspecteur-aide" data-planche-saisie-origine>{t("extensions.saisie.demandee", { extension: saisie.extension })}</p>
        {demande.champs.map((c) =>
          c.genre === "case" ? (
            <label key={c.id} className="planche-saisie-case">
              <input type="checkbox" checked={valeurs[c.id] === true} onChange={(e) => poser(c.id, e.target.checked)} data-saisie-champ={c.id} />
              {c.libelle}
            </label>
          ) : (
            <label key={c.id} className="planche-saisie-champ">
              <span>{c.genre === "nombre" && c.unite ? `${c.libelle} (${c.unite})` : c.libelle}</span>
              {c.genre === "choix" ? (
                <select value={String(valeurs[c.id])} onChange={(e) => poser(c.id, e.target.value)} data-saisie-champ={c.id}>
                  {c.choix.map((x) => (
                    <option key={x.valeur} value={x.valeur}>{x.libelle}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  inputMode={c.genre === "nombre" ? "decimal" : undefined}
                  autoComplete="off"
                  value={String(valeurs[c.id])}
                  aria-invalid={c.genre === "nombre" && lireNombreSaisi(String(valeurs[c.id])) === null ? true : undefined}
                  onChange={(e) => poser(c.id, e.target.value)}
                  data-saisie-champ={c.id}
                />
              )}
            </label>
          ),
        )}
        {erreur && <p className="planche-saisie-erreur" role="alert" data-planche-saisie-erreur>{erreur}</p>}
        <div className="planche-dialogue-actions">
          <button type="button" className="secondary" onClick={() => saisie.repondre(null)} data-planche-saisie-annuler>{t("extensions.saisie.annuler")}</button>
          <button type="submit" data-planche-saisie-valider>{t("extensions.saisie.valider")}</button>
        </div>
      </form>
    </div>
  );
}
