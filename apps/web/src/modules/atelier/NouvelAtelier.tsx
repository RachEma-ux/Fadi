/**
 * Montage de l'Atelier (tâche L3a.4, cahier §5.7 / §5.8, lot 3a ; seul Atelier depuis la bascule du lot 4) : bus
 * local et synchronisation (lot 2), registres d'outils / dessinateurs / inspecteur alimentés par les modules
 * installés, contexte, pilote, état de vue, puis l'interface (`ui/`) avec la zone de plan (`plan2d/`) comme zone
 * de travail. Module `atelier` et Atelier des étapes 10 et 11 du Parcours (D-052).
 *
 * Référence protégée de l'exemple (`exampleMode = "reference"`, D-052 §7) : la première commande crée une copie de
 * travail, y est envoyée, puis l'écran bascule sur la copie (même module, même étape) ; la référence reste intacte.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { atelierCommandesApi } from "../../lib/api/atelier-commandes";
import { READ_ONLY_HINT } from "../../lib/access";
import { BusAtelier, joignabiliteNavigateur, stockageNavigateur, type TransportAtelier } from "./bus";
import { PanneauMetre } from "./documents";
import { installer as installerDocuments } from "./documents/installer";
import { installer as installerObjets } from "./objets/installer";
import { installer as installerPlan2d } from "./plan2d/installer";
import { ZonePlan } from "./plan2d/ZonePlan";
import { installer as installerVue3d } from "./vue3d/installer";
import { Vue3d } from "./vue3d/Vue3d";
import { creerContexte, creerEtatInterface, creerPilote, creerRegistres, creerSelection, type InstallationModule } from "./socle";
import { AtelierInterface } from "./ui/AtelierInterface";

/**
 * Modules qui enregistrent leurs outils, dessinateurs et descripteurs (une classe n'est prise qu'une fois, un
 * raccourci aussi, D-037) : plan 2D (L A C R), architecture (M P F O S E), documents simples (K T U), vue 3D
 * (pousser / tirer, extruder ; sans raccourci).
 */
export const MODULES_ATELIER: readonly InstallationModule[] = [installerPlan2d, installerObjets, installerDocuments, installerVue3d];

/** Relecture des révisions distantes (second navigateur, autre membre) : au retour sur l'onglet et périodiquement. */
const RELECTURE_MS = 30_000;

/** Nom de la copie de travail créée à la première commande sur la référence protégée de l'exemple. */
export const NOM_COPIE_TRAVAIL = "copie de travail · Atelier";
export const MESSAGE_REFERENCE_PROTEGEE = "Exemple protégé : votre première modification ouvre une copie de travail et s’y enregistre ; la référence reste intacte.";

interface ProprietesNouvelAtelier {
  readonly projet: { readonly id: string; readonly code: string; readonly nom: string; readonly exampleMode?: "reference" | "editable" | null };
  readonly readOnly?: boolean;
  /** Étape du Parcours (10, 11) qui ouvre l'Atelier ; `null` pour le module Atelier. */
  readonly etape?: number | null;
  /** Actions ajoutées au bandeau (ex. « Harmonie » à l'étape 10). */
  readonly actionsEntete?: ReactNode;
}

interface CopieTravail {
  readonly id: string;
}

/**
 * Transport de la référence protégée : la première écriture crée la copie de travail (une seule fois), puis toutes
 * les écritures vont à la copie. La copie reprend le modèle typé courant (mêmes identifiants, même révision, même
 * empreinte), donc le lot s'y applique à l'identique.
 */
export function transportReference(base: TransportAtelier, creerCopie: () => Promise<CopieTravail>, surCopie: (copie: CopieTravail) => void): TransportAtelier {
  let copie: Promise<CopieTravail> | null = null;
  return {
    lireModele: (projectId) => base.lireModele(projectId),
    lireJournal: (projectId, apres) => base.lireJournal(projectId, apres),
    async envoyerCommandes(_projectId, enveloppe) {
      copie ??= creerCopie();
      const c = await copie;
      const resultat = await base.envoyerCommandes(c.id, enveloppe);
      surCopie(c);
      return resultat;
    },
  };
}

function monter(projetId: string, readOnly: boolean, transport: TransportAtelier) {
  const { stockage } = stockageNavigateur();
  const bus = new BusAtelier({ projectId: projetId, transport, stockage, joignabilite: joignabiliteNavigateur() });
  const registres = creerRegistres();
  for (const installer of MODULES_ATELIER) installer(registres);
  const selection = creerSelection();
  const vue = creerEtatInterface();
  const ecriture = readOnly ? ({ permise: false, motif: READ_ONLY_HINT } as const) : ({ permise: true } as const);
  const ctx = creerContexte({ projetId, bus, client: atelierCommandesApi, selection, vue, ecriture });
  const pilote = creerPilote(registres.outils, ctx, vue);
  return { bus, registres, ctx, pilote, vue };
}

export function NouvelAtelier({ projet, readOnly = false, etape = null, actionsEntete }: ProprietesNouvelAtelier) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  // L'adresse courante (module, étape) est lue au moment de la copie, sans remonter l'Atelier à chaque changement.
  const adresse = useRef(location.search);
  adresse.current = location.search;
  const reference = !readOnly && projet.exampleMode === "reference";
  const montage = useMemo(() => {
    const transport = reference
      ? transportReference(
          atelierCommandesApi,
          () => api.copyProject(projet.id, NOM_COPIE_TRAVAIL),
          (copie) => {
            void queryClient.invalidateQueries({ queryKey: ["projects"] });
            navigate(`/projets/${copie.id}?${new URLSearchParams(adresse.current).toString()}`, { state: { notice: "Copie de travail créée automatiquement · exemple original conservé." } });
          },
        )
      : atelierCommandesApi;
    return monter(projet.id, readOnly, transport);
  }, [projet.id, readOnly, reference, navigate, queryClient]);
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
        Atelier : le modèle n’a pas pu être ouvert ({echec}). Recharger la page ; si l’erreur persiste, signaler le projet.
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
        etape={etape}
        actionsEntete={actionsEntete}
        note={reference ? `${MESSAGE_REFERENCE_PROTEGEE} Copie : « ${projet.code} — ${NOM_COPIE_TRAVAIL} ».` : null}
      />
    </div>
  );
}
