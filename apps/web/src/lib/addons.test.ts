/** Page « Extensions » : répartition « Installées » / « Disponibles » d'un compte dans le catalogue de la plateforme. */
import { describe, expect, it } from "vitest";
import { CATALOGUE_LIVRE, PREFERENCES_SANDBOX_DEFAUT, catalogueExtensions, EXTENSIONS_SANDBOX } from "@parcours/sandbox-planche-model";
import { repartirExtensions } from "./addons";

const ids = (l: readonly { extension: { id: string } }[]) => l.map((x) => x.extension.id);
const prefs = (extensions: Record<string, boolean>) => ({ ...PREFERENCES_SANDBOX_DEFAUT, extensions });

describe("page « Extensions » — répartition", () => {
  it("compte qui n'a rien choisi, catalogue livré : les extensions actives d'origine sont installées, les autres disponibles", () => {
    const r = repartirExtensions({ preferences: prefs({}), catalogue: CATALOGUE_LIVRE });
    expect(ids(r.installees)).toEqual(EXTENSIONS_SANDBOX.filter((x) => x.activeParDefaut).map((x) => x.id));
    expect(ids(r.disponibles)).toEqual(EXTENSIONS_SANDBOX.filter((x) => !x.activeParDefaut).map((x) => x.id));
    expect(r.installees.length + r.disponibles.length).toBe(EXTENSIONS_SANDBOX.length);
    expect(r.installees[0]!.fiche.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("installer et désinstaller déplacent l'extension d'une liste à l'autre", () => {
    const r = repartirExtensions({ preferences: prefs({ controle: true, bois: false }), catalogue: CATALOGUE_LIVRE });
    expect(ids(r.installees)).toContain("controle");
    expect(ids(r.installees)).not.toContain("bois");
    expect(ids(r.disponibles)).toContain("bois");
  });

  it("une extension retirée par la plateforme n'est dans aucune liste ; une expérimentale reste proposée avec son état", () => {
    const catalogue = catalogueExtensions({ volumes: { etat: "retiree", activeParDefaut: true }, controle: { etat: "experimentale", activeParDefaut: false } });
    const r = repartirExtensions({ preferences: prefs({ volumes: true }), catalogue });
    expect([...ids(r.installees), ...ids(r.disponibles)]).not.toContain("volumes");
    expect(r.disponibles.find((x) => x.extension.id === "controle")?.fiche.etat).toBe("experimentale");
  });

  it("le réglage d'origine de la plateforme décide pour qui n'a rien choisi", () => {
    const catalogue = catalogueExtensions({ controle: { etat: "disponible", activeParDefaut: true } });
    expect(ids(repartirExtensions({ preferences: prefs({}), catalogue }).installees)).toContain("controle");
    expect(ids(repartirExtensions({ preferences: prefs({ controle: false }), catalogue }).disponibles)).toContain("controle");
  });
});
