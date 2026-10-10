/**
 * Bouton « Outils ▾ » de la Planche (D-198, demande du maître d'ouvrage du 10 octobre 2026) : une entrée de plus vers
 * les outils, à côté du rail de gauche et de la grille « … » qui restent inchangés. Comme le bouton « Plan » (D-195),
 * un clic ouvre la liste sous le bouton ; Échap, un clic ailleurs ou le choix d'une icône la referment.
 *
 * Liste (rôle `menu`) : champ « Rechercher un outil… » (Entrée active le premier outil retenu), puis un groupe par
 * famille du catalogue (flèche ▾ / ▸ + nom), une ligne par outil — cliquer le NOM déplie / replie sa barre d'opérations
 * (① Créer, ② Modifier, ③ Mesurer / annoter) dans la liste ; la case « afficher » montre cette barre en barre flottante
 * sur le dessin —, et en pied « ⚙ Barres d'outils » (barres affichées, « Réinitialiser la disposition »). Clavier :
 * flèches haut / bas (Début, Fin) d'un élément à l'autre, flèche droite / gauche pour déplier / replier, Entrée, Échap.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { outilParId, type FamilleOutil, type Outil } from "@parcours/planche-model";
import { barreDe, groupesOutils, libelleOperation, premierOutil, type SectionBarre } from "./barres-outils";
import type { EtatBarresOutils } from "./barres-outils-disposition";
import { t } from "../messages";
import { afficherRaccourci, nomOutil, pictoOutil, raccourciOutil } from "./outils-planche";

export interface PropsBoutonOutils {
  /** Outil actif (surligné dans la liste). */
  outilId: string;
  /** Motif d'indisponibilité d'un outil (`null` = disponible), comme le rail de gauche. */
  raison: (o: Outil) => string | null;
  /** Active un outil exactement comme la barre de gauche. */
  onChoisir: (id: string) => void;
  barres: EtatBarresOutils;
  onAfficherBarre: (id: string, afficher: boolean) => void;
  onReinitialiser: () => void;
}

/** Bouton d'une opération : pictogramme propre à l'outil, « Nom — raccourci » en infobulle et en nom accessible. */
export function titreOperation(o: Outil, raison: string | null): string {
  return `${libelleOperation(o)}${raison ? ` — ${raison}` : ""}`;
}

export function BoutonOutils({ outilId, raison, onChoisir, barres, onAfficherBarre, onReinitialiser }: PropsBoutonOutils) {
  const [ouvert, setOuvert] = useState(false);
  const [requete, setRequete] = useState("");
  const [familles, setFamilles] = useState<ReadonlySet<FamilleOutil>>(() => new Set());
  const [deplies, setDeplies] = useState<ReadonlySet<string>>(() => new Set());
  // Téléphone : la liste sort en surcouche fixe, posée juste sous le bouton (la barre du haut défile, D-192).
  const [hautTelephone, setHautTelephone] = useState<number | null>(null);
  const racine = useRef<HTMLDivElement | null>(null);
  const bouton = useRef<HTMLButtonElement | null>(null);
  const champ = useRef<HTMLInputElement | null>(null);
  const idListe = useId();
  const groupes = useMemo(() => groupesOutils(requete), [requete]);
  const filtre = requete.trim() !== "";

  const fermer = (rendreFocus = true) => {
    setOuvert(false);
    setRequete("");
    if (rendreFocus) bouton.current?.focus();
  };

  useEffect(() => {
    if (!ouvert) return;
    // Fenêtre où vit la Planche (page ou fenêtre détachée).
    const w = racine.current?.ownerDocument.defaultView ?? window;
    const surClic = (e: PointerEvent) => {
      const c = e.target as Node | null;
      if (racine.current && c && !racine.current.contains(c)) fermer(false);
    };
    const surTouche = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Échap ne ferme que la liste : la Planche (fin de tracé, outil précédent) ne la reçoit pas.
      e.stopImmediatePropagation();
      e.preventDefault();
      fermer();
    };
    w.addEventListener("pointerdown", surClic, true);
    w.addEventListener("keydown", surTouche, true);
    return () => {
      w.removeEventListener("pointerdown", surClic, true);
      w.removeEventListener("keydown", surTouche, true);
    };
  }, [ouvert]);

  const ouvrir = (clavier: boolean) => {
    // Famille de l'outil actif dépliée à l'ouverture (les autres repliées, chacune avec sa flèche).
    const f = outilParId(outilId)?.famille;
    setFamilles((s) => (f && !s.has(f) ? new Set([...s, f]) : s));
    const w = racine.current?.ownerDocument.defaultView ?? window;
    const r = bouton.current?.getBoundingClientRect();
    setHautTelephone(r && w.matchMedia("(max-width: 760px)").matches ? Math.round(r.bottom + 4) : null);
    setOuvert(true);
    if (clavier) requestAnimationFrame(() => champ.current?.focus());
  };

  const choisir = (id: string) => {
    onChoisir(id);
    fermer();
  };

  const basculerFamille = (f: FamilleOutil) =>
    setFamilles((s) => {
      const n = new Set(s);
      if (n.has(f)) n.delete(f);
      else n.add(f);
      return n;
    });
  const basculerOutil = (id: string) =>
    setDeplies((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  /** Éléments parcourus au clavier, dans l'ordre affiché : le champ, puis chaque élément du menu. */
  const navigables = () => Array.from(racine.current?.querySelectorAll<HTMLElement>("[data-outils-nav]") ?? []).filter((e) => !(e as HTMLButtonElement).disabled);
  const surClavier = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Rien de ce qu'on tape dans la liste ne doit atteindre le clavier de la Planche (raccourcis, touches d'état).
    e.stopPropagation();
    const items = navigables();
    const cible = e.target as HTMLElement;
    const i = items.indexOf(cible);
    const vers = (j: number) => {
      e.preventDefault();
      items[(j + items.length) % items.length]?.focus();
    };
    if (e.key === "ArrowDown") vers(i + 1);
    else if (e.key === "ArrowUp") vers(i - 1);
    else if (e.key === "Home" && cible !== champ.current) vers(0);
    else if (e.key === "End" && cible !== champ.current) vers(items.length - 1);
    else if (e.key === "ArrowRight" && cible.getAttribute("aria-expanded") === "false") {
      e.preventDefault();
      cible.click();
    } else if (e.key === "ArrowLeft" && cible.getAttribute("aria-expanded") === "true") {
      e.preventDefault();
      cible.click();
    }
  };

  const operations = (o: Outil, sections: SectionBarre[]) => (
    <div className="planche-outils-ops" role="group" aria-label={t("outils.barre", { outil: nomOutil(o) })} data-outils-barre={o.id}>
      {sections.map((s) => (
        <div key={s.cle} className="planche-outils-section" role="group" aria-label={`${s.numero} ${s.libelle}`} data-outils-section={s.cle}>
          <span className="planche-outils-section-titre" aria-hidden="true">
            {s.numero} {s.libelle}
          </span>
          <span className="planche-outils-icones">
            {s.outils.map((x) => {
              const r = raison(x);
              const actif = x.id === outilId;
              return (
                <button
                  key={x.id}
                  type="button"
                  role="menuitem"
                  className={`planche-outils-op${actif ? " est-actif" : ""}${r ? " est-indisponible" : ""}`}
                  aria-current={actif ? "true" : undefined}
                  aria-disabled={r ? true : undefined}
                  title={titreOperation(x, r)}
                  aria-label={titreOperation(x, r)}
                  data-outils-nav
                  data-outils-operation={x.id}
                  data-raccourci={raccourciOutil(x) ?? undefined}
                  onClick={() => choisir(x.id)}
                >
                  <span aria-hidden="true">{pictoOutil(x.id)}</span>
                </button>
              );
            })}
          </span>
        </div>
      ))}
    </div>
  );

  const affichees = barres.visibles.map((id) => outilParId(id)).filter((o): o is Outil => o !== null);

  return (
    <div className="planche-outils-menu" ref={racine} onKeyDown={ouvert ? surClavier : undefined} data-planche-outils-menu>
      <button
        type="button"
        ref={bouton}
        className="planche-outils-bouton"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-controls={ouvert ? idListe : undefined}
        title={t("outils.bouton.aide")}
        data-planche-outils-bouton
        onClick={(e) => (ouvert ? fermer() : ouvrir(e.detail === 0))}
      >
        {t("outils.bouton")}
        <span aria-hidden="true" className="planche-outils-chevron">▾</span>
      </button>
      {ouvert && (
        <div className="planche-outils-liste" style={hautTelephone !== null ? { top: `${hautTelephone}px`, maxHeight: `calc(100vh - ${hautTelephone + 8}px)` } : undefined} data-planche-outils-liste>
          <div className="planche-outils-recherche">
            <span aria-hidden="true">⌕</span>
            <input
              ref={champ}
              type="search"
              value={requete}
              placeholder={t("outils.recherche")}
              aria-label={t("outils.recherche")}
              aria-controls={idListe}
              autoComplete="off"
              data-outils-nav
              data-outils-recherche
              onChange={(e) => setRequete(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const o = premierOutil(requete);
                  if (o) choisir(o.id);
                }
              }}
            />
          </div>
          <div id={idListe} className="planche-outils-arbre" role="menu" aria-label={t("outils.menu")}>
            {filtre && groupes.length === 0 && <p className="inspecteur-aide" role="none">{t("outils.aucun")}</p>}
            {groupes.map((g) => {
              const deplie = filtre || familles.has(g.famille);
              return (
                <div key={g.famille} className="planche-outils-groupe" role="group" aria-label={g.libelle} data-outils-groupe={g.famille}>
                  <button type="button" role="menuitem" className="planche-outils-famille" aria-expanded={deplie} data-outils-nav data-outils-famille={g.famille} onClick={() => !filtre && basculerFamille(g.famille)}>
                    <span aria-hidden="true" className="planche-outils-fleche">{deplie ? "▾" : "▸"}</span>
                    {g.libelle}
                  </button>
                  {deplie &&
                    g.outils.map((o) => {
                      const sections = barreDe(o.id);
                      const ouverte = deplies.has(o.id);
                      const affichee = barres.visibles.includes(o.id);
                      const r = raccourciOutil(o);
                      const actif = o.id === outilId;
                      return (
                        <div key={o.id} className={`planche-outils-ligne${actif ? " est-actif" : ""}`} role="none" data-outils-ligne={o.id}>
                          <div className="planche-outils-tete" role="none">
                            <button type="button" role="menuitem" className="planche-outils-nom" aria-expanded={ouverte} aria-current={actif ? "true" : undefined} title={t("outils.deplier", { operation: libelleOperation(o) })} data-outils-nav data-outils-outil={o.id} onClick={() => basculerOutil(o.id)}>
                              <span aria-hidden="true" className="planche-outils-picto">{pictoOutil(o.id)}</span>
                              <span className="planche-outils-libelle">{nomOutil(o)}</span>
                              {r && (
                                <>
                                  <span aria-hidden="true"> · </span>
                                  <kbd>{afficherRaccourci(r)}</kbd>
                                </>
                              )}
                              <span aria-hidden="true" className="planche-outils-fleche">{ouverte ? "▾" : "▸"}</span>
                            </button>
                            <button type="button" role="menuitemcheckbox" className="planche-outils-afficher" aria-checked={affichee} aria-label={t("outils.afficher.aide", { outil: nomOutil(o) })} title={t("outils.afficher.aide", { outil: nomOutil(o) })} data-outils-nav data-outils-afficher={o.id} onClick={() => onAfficherBarre(o.id, !affichee)}>
                              <span aria-hidden="true" className="planche-outils-case">{affichee ? "☑" : "☐"}</span>
                              <span aria-hidden="true">{t("outils.afficher")}</span>
                            </button>
                          </div>
                          {ouverte && sections && operations(o, sections)}
                        </div>
                      );
                    })}
                </div>
              );
            })}
            <div className="planche-outils-pied" role="group" aria-label="Barres d'outils" data-outils-reglages>
              <span className="planche-outils-pied-titre" aria-hidden="true">
                ⚙ {t("outils.pied")}
              </span>
              {affichees.length === 0 && (
                <span className="inspecteur-aide" role="none">
                  {t("outils.pied.aucune")}
                </span>
              )}
              {affichees.map((o) => (
                <button key={o.id} type="button" role="menuitemcheckbox" aria-checked="true" className="planche-outils-afficher" aria-label={t("outils.afficher.aide", { outil: nomOutil(o) })} data-outils-nav data-outils-barre-visible={o.id} onClick={() => onAfficherBarre(o.id, false)}>
                  <span aria-hidden="true" className="planche-outils-case">☑</span>
                  <span aria-hidden="true" className="planche-outils-picto">{pictoOutil(o.id)}</span>
                  <span aria-hidden="true">{nomOutil(o)}</span>
                </button>
              ))}
              <button type="button" role="menuitem" className="planche-outils-reinitialiser" disabled={Object.keys(barres.positions).length === 0} data-outils-nav data-outils-reinitialiser onClick={onReinitialiser}>
                {t("outils.reinitialiser")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
