import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { wallPolygon } from "@parcours/core-geometry";
import { CommandHistory, type Command } from "@parcours/domain-model";
import { api, type ArchitecturalObjectDto } from "../../lib/api";

interface WallProperties {
  a: [number, number];
  b: [number, number];
  thickness: number;
  [key: string]: unknown;
}

function isWallProperties(p: Record<string, unknown>): p is WallProperties {
  return (
    Array.isArray(p["a"]) &&
    Array.isArray(p["b"]) &&
    typeof p["thickness"] === "number"
  );
}

/**
 * État local de l'historique de commandes : la liste des murs affichés
 * pendant que les mutations réseau sont en vol. `CommandHistory` donne
 * l'annulation/rétablissement immédiats côté client ; la persistance réelle
 * (et la source de vérité) reste le serveur — voir `syncFromServer`.
 */
interface AtelierState {
  walls: ArchitecturalObjectDto[];
}

function addWallCommand(wall: ArchitecturalObjectDto): Command<AtelierState> {
  return {
    label: `Ajouter un mur (${wall.id})`,
    apply: (state) => ({ walls: [...state.walls, wall] }),
    undo: (state) => ({ walls: state.walls.filter((w) => w.id !== wall.id) }),
  };
}

export function AtelierPanel({ projectId, levelId }: { projectId: string; levelId: string }) {
  const queryClient = useQueryClient();
  const objectsQuery = useQuery({
    queryKey: ["objects", projectId, levelId],
    queryFn: () => api.listObjects(projectId, levelId),
  });

  const [history] = useState(() => new CommandHistory<AtelierState>({ walls: [] }));
  const [, forceRender] = useState(0);
  const rerender = () => forceRender((n) => n + 1);

  // Le serveur reste la source de vérité : on adopte sa liste de murs une
  // seule fois, au premier chargement réussi, sans l'enregistrer comme une
  // commande annulable (ce n'est pas une action de l'utilisateur).
  const syncedOnce = useRef(false);
  useEffect(() => {
    if (objectsQuery.data && !syncedOnce.current) {
      syncedOnce.current = true;
      history.do({
        label: "Charger depuis le serveur",
        apply: () => ({ walls: objectsQuery.data }),
        undo: (s) => s,
      });
      rerender();
    }
  }, [objectsQuery.data, history]);

  const [length, setLength] = useState(4);
  const [thickness, setThickness] = useState(0.2);

  const createWall = useMutation({
    mutationFn: () =>
      api.createObject(projectId, levelId, "wall", {
        a: [0, 0],
        b: [length, 0],
        thickness,
      } satisfies WallProperties),
    onSuccess: (created) => {
      history.do(addWallCommand(created));
      rerender();
      void queryClient.invalidateQueries({ queryKey: ["objects", projectId, levelId] });
      void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    },
  });

  const deleteWall = useMutation({
    mutationFn: (wallId: string) => api.deleteObject(projectId, levelId, wallId),
    onSuccess: (_void, wallId) => {
      const target = history.getState().walls.find((w) => w.id === wallId);
      if (target) {
        history.do({
          label: `Supprimer un mur (${wallId})`,
          apply: (state) => ({ walls: state.walls.filter((w) => w.id !== wallId) }),
          undo: (state) => ({ walls: [...state.walls, target] }),
        });
        rerender();
      }
      void queryClient.invalidateQueries({ queryKey: ["objects", projectId, levelId] });
      void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    },
  });

  const walls = history.getState().walls;

  return (
    <div className="atelier-panel">
      <p>
        Les murs créés ici sont envoyés à l'API et persistés en base (PostgreSQL). L'annulation/le rétablissement
        ci-dessous agissent sur l'affichage local immédiatement ; la suppression ou la recréation côté serveur suit
        la commande.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          createWall.mutate();
        }}
      >
        <label htmlFor="wall-length">
          Longueur : {length.toFixed(1)} m
          <input
            id="wall-length"
            type="range"
            min={1}
            max={12}
            step={0.5}
            value={length}
            onChange={(e) => setLength(Number(e.target.value))}
          />
        </label>
        <label htmlFor="wall-thickness">
          Épaisseur : {thickness.toFixed(2)} m
          <input
            id="wall-thickness"
            type="range"
            min={0.1}
            max={0.6}
            step={0.05}
            value={thickness}
            onChange={(e) => setThickness(Number(e.target.value))}
          />
        </label>
        <button type="submit" disabled={createWall.isPending}>
          {createWall.isPending ? "Ajout…" : "Ajouter un mur"}
        </button>
      </form>

      <div className="atelier-history-controls">
        <button type="button" disabled={!history.canUndo()} onClick={() => { history.undo(); rerender(); }}>
          Annuler
        </button>
        <button type="button" disabled={!history.canRedo()} onClick={() => { history.redo(); rerender(); }}>
          Rétablir
        </button>
      </div>

      {objectsQuery.isLoading && <p role="status">Chargement des murs…</p>}
      {objectsQuery.isError && <p role="alert">Impossible de charger les murs de ce niveau.</p>}

      <ul className="wall-list">
        {walls.map((wall) => {
          const props = wall.properties;
          if (!isWallProperties(props)) return null;
          const polygon = wallPolygon({ id: wall.id, a: props.a, b: props.b, thickness: props.thickness });
          const points = polygon.map(([x, y]) => `${40 + x * 30},${90 - y * 30}`).join(" ");
          return (
            <li key={wall.id}>
              <svg viewBox="0 0 360 180" role="img" aria-label={`Mur de ${props.b[0] - props.a[0]} m`}>
                <polygon points={points} fill="#88a896" stroke="#294a3b" />
              </svg>
              <button type="button" onClick={() => deleteWall.mutate(wall.id)} disabled={deleteWall.isPending}>
                Supprimer
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
