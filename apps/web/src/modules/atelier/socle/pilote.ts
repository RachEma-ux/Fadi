/** Pilote de l'outil actif (contrat `PiloteOutils`, figé au lot 3a). */
import type { Apercu, ContexteAtelier, DefinitionOutil, ErreurLisible, EtatInterface, EvenementPlan, PiloteOutils, RegistreOutils, SessionOutil, VueTravail } from "./contrats";

/** Motif lisible d'un outil inutilisable dans la vue courante (plan 2D ou 3D). */
export const motifVue = (vue: VueTravail): string => (vue === "3d" ? "outil du plan 2D : revenir à la vue « Plan 2D »" : "outil de la vue 3D : passer en vue « 3D »");

export const APERCU_VIDE: Apercu = { formes: [], champs: [], consigne: "", erreurs: [] };

export function creerPilote(registre: RegistreOutils, ctx: ContexteAtelier, vue: EtatInterface): PiloteOutils {
  let outil: DefinitionOutil | null = null;
  let session: SessionOutil | null = null;
  let erreurs: readonly ErreurLisible[] = [];
  const ecouteurs = new Set<() => void>();
  const publier = () => {
    for (const e of [...ecouteurs]) e();
  };
  const fermer = () => {
    session = null;
    outil = null;
    vue.modifier({ outilActif: null });
  };
  const pilote: PiloteOutils = {
    activer(id) {
      session?.abandonner();
      fermer();
      erreurs = [];
      if (id === null) {
        publier();
        return { ok: true };
      }
      const def = registre.trouver(id);
      if (!def) return { ok: false, motif: `outil « ${id} » inconnu` };
      if (def.ecrit && !ctx.ecriture.permise) return { ok: false, motif: ctx.ecriture.motif };
      const vueCourante = vue.lire().vue;
      if (!def.vues.includes(vueCourante)) return { ok: false, motif: motifVue(vueCourante) };
      const activation = def.activation(ctx);
      if (!activation.ok) return activation;
      outil = def;
      session = def.commencer(ctx);
      vue.modifier({ outilActif: id });
      publier();
      return { ok: true };
    },
    outilActif: () => outil,
    async traiter(evenement: EvenementPlan) {
      if (!session) return;
      const s = session;
      const r = s.traiter(evenement);
      if (r.action === "valider") {
        const v = await ctx.valider(r.label, r.commandes);
        erreurs = v.ok ? [] : v.erreurs;
        if (v.ok && r.terminer && session === s) fermer();
      } else if (r.action === "terminer") {
        fermer();
      } else if (r.action === "selectionner") {
        ctx.selection.choisir(r.ids, r.mode);
      }
      publier();
    },
    apercu: () => session?.apercu() ?? APERCU_VIDE,
    derniereErreur: () => erreurs,
    abandonner() {
      session?.abandonner();
      fermer();
      publier();
    },
    abonner(ecouteur) {
      ecouteurs.add(ecouteur);
      return () => ecouteurs.delete(ecouteur);
    },
  };
  return pilote;
}
