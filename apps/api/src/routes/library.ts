/**
 * Bibliothèque des bâtiments (Parcours V6.1) — lecture seule : 10 types,
 * 21 cas, 3 variantes chacun, références réglementaires. Les cas sources
 * sont immuables ; leur application à un projet passe par
 * `routes/programme.ts` (`POST /projects/:id/programme/case`).
 *
 *   GET /library/buildings      → { version, date, surfaceConvention, profiles, cases (résumés) }
 *   GET /library/buildings/:id  → { case, references, surfaceConvention, version }
 */
import { Router } from "express";
import { buildingCase, programmeCaseSums, referenceRows } from "@parcours/domain-model";
import { requireAuth } from "../middleware/require-auth.js";
import { BUILDING_LIBRARY, PARCOURS_STEPS } from "../data/parcours.js";

/** `routeNames` de building-library-app : ce que chaque étape reçoit du cas (l'entrée 22 « Harmony » du V6 n'est plus une étape). */
const ROUTE_NAMES: Record<number, string> = {
  1: "Lieu et source du site ; aucune parcelle fictive n’est injectée",
  2: "Cadre réglementaire, champs d’applicabilité et réserves",
  3: "Clientèle et demande à documenter",
  4: "Type, sous-type, objectifs et mode d’exploitation",
  5: "Usagers, capacité et concertation",
  6: "Programme maître, surfaces et performances",
  7: "Fiches espaces, Répartition, adjacences et flux",
  8: "Technique, dimensions, accessibilité, sécurité et réseaux",
  9: "Comparaison besoins / possibilités réelles du site",
  10: "Transmission du programme à l’Atelier, sans modifier son modèle",
  11: "Livrables et vérifications des dessins techniques",
  12: "Trois variantes programmatiques distinctes des alternatives de montage",
  13: "Investigations et points BET à résoudre",
  14: "Budget non inventé ; anciennes simulations conservées comme sources",
  15: "Sensibilités et hypothèses à chiffrer",
  16: "Registre des pièces, preuves et réserves",
  17: "Critères de lecture, aucune note automatique",
  18: "Synthèse du programme et des conditions restantes",
  19: "Aucune décision GO importée d’un exemple",
  20: "Missions proposées, à lancer uniquement après décision",
  21: "Dossier versionné, hypothèses et fiche de transmission",
};

export const libraryRouter = Router();
libraryRouter.use(requireAuth);

libraryRouter.get("/buildings", (_req, res) => {
  res.json({
    version: BUILDING_LIBRARY.version,
    date: BUILDING_LIBRARY.date,
    surfaceConvention: BUILDING_LIBRARY.surfaceConvention,
    profiles: Object.values(BUILDING_LIBRARY.profiles).map((p) => ({ id: p.id, label: p.label, tags: p.tags })),
    steps: PARCOURS_STEPS.map((d) => ({ number: d.number, title: d.title, route: ROUTE_NAMES[d.number] ?? "" })),
    cases: BUILDING_LIBRARY.cases.map((c) => {
      const t = programmeCaseSums(c.spaces);
      return {
        id: c.id,
        type: c.type,
        subtype: c.subtype,
        title: c.title,
        capacity: c.capacity,
        unit: c.unit,
        users: c.users,
        summary: c.summary,
        origin: c.origin,
        sourceKey: c.sourceKey ?? null,
        spaceCount: c.spaces.length,
        scenarioCount: c.scenarios.length,
        programmeArea: t.programme,
        paroisArea: t.parois,
      };
    }),
  });
});

libraryRouter.get("/buildings/:id", (req, res) => {
  const c = buildingCase(BUILDING_LIBRARY, req.params["id"] as string);
  if (!c) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ case: c, references: referenceRows(BUILDING_LIBRARY, c), surfaceConvention: BUILDING_LIBRARY.surfaceConvention, version: BUILDING_LIBRARY.version });
});
