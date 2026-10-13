import { describe, expect, it } from "vitest";
import { COCKPIT_CAPABILITIES, cockpitCapabilityHref, cockpitCapabilityLabel } from "./capabilities";

describe("capacités du cockpit", () => {
  it("ne fournit jamais de lien actif aux fonctionnalités planifiées", () => {
    const planned = COCKPIT_CAPABILITIES.filter((item) => item.state === "planned");
    expect(planned.length).toBeGreaterThan(0);
    expect(planned.every((item) => cockpitCapabilityHref("P.118", item) === null)).toBe(true);
    expect(cockpitCapabilityLabel("planned")).toBe("À développer");
  });
  it("conserve le contexte projet pour chaque outil disponible", () => {
    const available = COCKPIT_CAPABILITIES.filter((item) => item.state !== "planned");
    expect(available.every((item) => cockpitCapabilityHref("project/1", item)?.startsWith("/projets/project%2F1?module="))).toBe(true);
    expect(available.some((item) => item.state === "limited")).toBe(true);
  });
});
