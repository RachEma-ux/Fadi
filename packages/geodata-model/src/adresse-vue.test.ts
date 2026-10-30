import { describe, expect, it } from "vitest";
import { ecrireAdresseVue, lireAdresseVue, type EtatAdresse } from "./adresse-vue.js";

const etat: EtatAdresse = {
  camera: { lon: -7.468281234, lat: 33.646431234, zoom: 14.3049, cap: 0 },
  carteId: null,
  couches: [{ coucheId: "hcp-communes", versionId: "gdv_01", visible: true, regrouper: false }, { coucheId: "osm-hotels", versionId: "gdv_02", visible: false, regrouper: true }],
  indicateur: { theme: "Démographie", famille: "Population légale", modalite: null, milieu: "urbain", sexe: "ensemble" },
};

describe("état de la carte dans l'adresse (D-GD-39)", () => {
  it("aller-retour : caméra arrondie, couches dans l'ordre avec masquage et regroupement, indicateur", () => {
    const lu = lireAdresseVue(`#${ecrireAdresseVue(etat)}`);
    expect(lu).toEqual({ ...etat, camera: { lon: -7.46828, lat: 33.64643, zoom: 14.3, cap: 0 } });
  });
  it("forme lisible : v=lon,lat,zoom,cap et c=couche~version~options", () => {
    const f = ecrireAdresseVue({ camera: { lon: 1, lat: 2, zoom: 3, cap: 4 }, carteId: "gdcarte_x", couches: [{ coucheId: "a", versionId: "b", visible: false, regrouper: true }], indicateur: null });
    expect(decodeURIComponent(f)).toBe("v=1,2,3,4&carte=gdcarte_x&c=a~b~m~g");
  });
  it("fragment vide ou étranger → null ; parties mal formées ignorées", () => {
    expect(lireAdresseVue("")).toBeNull();
    expect(lireAdresseVue("#section-2")).toBeNull();
    expect(lireAdresseVue("#v=999,0,3,0")).toBeNull();
    expect(lireAdresseVue("#v=1,2,30,0&carte=a/b")).toBeNull();
    expect(lireAdresseVue("#c=a~b,a~c,x,../y~z,c~d")!.couches.map((k) => k.coucheId)).toEqual(["a", "c"]);
    expect(lireAdresseVue("#v=1,2,3,-90&i={pas du json")).toEqual({ camera: { lon: 1, lat: 2, zoom: 3, cap: 270 }, carteId: null, couches: [], indicateur: null });
    expect(lireAdresseVue(`#i=${encodeURIComponent(JSON.stringify({ ...etat.indicateur, milieu: "autre" }))}`)).toBeNull();
  });
  it("aucune adresse ni clé ne peut entrer par le fragment (identifiants seulement)", () => {
    const lu = lireAdresseVue(`#carte=${encodeURIComponent("https://x")}&c=${encodeURIComponent("a~https://k?key=1")}`);
    expect(lu).toBeNull();
  });
});
