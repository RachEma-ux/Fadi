/**
 * Montage du nouvel Atelier (tâche L3a.4, cahier §5.7 / §5.8, lot 3a) : bus local et synchronisation (lot 2),
 * registres d'outils / dessinateurs / inspecteur alimentés par les modules installés, contexte, pilote, état de
 * vue, puis l'interface (`ui/`) avec la zone de plan (`plan2d/`) comme zone de travail.
 *
 * Ouvert par `?module=atelier&version=nouveau` à côté de l'ancien Atelier jusqu'à la bascule (lot 4). Le modèle
 * typé vient du serveur : pour un projet issu de l'exemple, P.118 y est importé à la première lecture (lot 2).
 */
import { useEffect, useMemo, useState } from "react";
import { atelierCommandesApi } from "../../lib/api/atelier-commandes";
import { READ_ONLY_HINT } from "../../lib/access";
import { BusAtelier, joignabiliteNavigateur, stockageNavigateur } from "./bus";
import { PanneauMetre } from "./documents";
import { installer as installerDocuments } from "./documents/installer";
import { installer as installerObjets } from "./objets/installer";
import { installer as installerPlan2d } from "./plan2d/installer";
import { ZonePlan } from "./plan2d/ZonePlan";
import { Vue3d } from "./vue3d/Vue3d";
import { creerContexte, creerEtatInterface, creerPilote, creerRegistres, creerSelection, type InstallationModule } from "./socle";
import { AtelierInterface } from "./ui/AtelierInterface";

/**
 * Modules qui enregistrent leurs outils, dessinateurs et descripteurs (une classe n'est prise qu'une fois, un
 * raccourci aussi, D-037) : plan 2D (L A C R), architecture (M P F O S E), documents simples (K T U).
 */
export const MODULES_ATELIER: readonly InstallationModule[] = [installerPlan2d, installerObjets, installerDocuments];

/** Relecture des révisions distantes (second navigateur, autre membre) : au retour sur l'onglet et périodiquement. */
const RELECTURE_MS = 30_000;

interface ProprietesNouvelAtelier {
  readonly projet: { readonly id: string; readonly code: string; readonly nom: string };
  readonly readOnly?: boolean;
}

function monter(projetId: string, readOnly: boolean) {
  const { stockage } = stockageNavigateur();
  const bus = new BusAtelier({ projectId: projetId, transport: atelierCommandesApi, stockage, joignabilite: joignabiliteNavigateur() });
  const registres = creerRegistres();
  for (const installer of MODULES_ATELIER) installer(registres);
  const selection = creerSelection();
  const vue = creerEtatInterface();
  const ecriture = readOnly ? ({ permise: false, motif: READ_ONLY_HINT } as const) : ({ permise: true } as const);
  const ctx = creerContexte({ projetId, bus, client: atelierCommandesApi, selection, vue, ecriture });
  const pilote = creerPilote(registres.outils, ctx, vue);
  return { bus, registres, ctx, pilote, vue };
}

export function NouvelAtelier({ projet, readOnly = false }: ProprietesNouvelAtelier) {
  const montage = useMemo(() => monter(projet.id, readOnly), [projet.id, readOnly]);
  const [ouvert, setOuvert] = useState(false);
  const [echec, setEchec] = useState<string | null>(null);

  useEffect(() => {
    const { bus } = montage;
    let actif = true;
    setOuvert(false);
    setEchec(null);
    bus.ouvrir().then(
      () => actif && setOuvert(true),
      (e: unknown) => actif && setEchec(e instanceof Error ? e.message : String(e)),
    );
    const relire = () => void bus.rafraichir().catch(() => undefined);
    const auRetour = () => document.visibilityState === "visible" && relire();
    document.addEventListener("visibilitychange", auRetour);
    const minuterie = window.setInterval(relire, RELECTURE_MS);
    return () => {
      actif = false;
      document.removeEventListener("visibilitychange", auRetour);
      window.clearInterval(minuterie);
      bus.fermer();
    };
  }, [montage]);

  if (echec) {
    return (
      <p role="alert" data-testid="nouvel-atelier-erreur">
        Nouvel Atelier : le modèle n’a pas pu être ouvert ({echec}). Recharger la page ; si l’erreur persiste, revenir à l’Atelier actuel.
      </p>
    );
  }
  if (!ouvert) return <p role="status">Ouverture du modèle…</p>;

  const { bus, registres, ctx, pilote, vue } = montage;
  return (
    <div className="nouvel-atelier" data-testid="nouvel-atelier">
      <AtelierInterface
        registres={registres}
        pilote={pilote}
        ctx={ctx}
        vue={vue}
        bus={bus}
        client={atelierCommandesApi}
        projet={projet}
        zoneTravail={<ZonePlan registres={registres} pilote={pilote} ctx={ctx} vue={vue} />}
        zoneTravail3d={<Vue3d ctx={ctx} vue={vue} pilote={pilote} />}
        panneauxProjet={() => <PanneauMetre ctx={ctx} />}
      />
    </div>
  );
}
