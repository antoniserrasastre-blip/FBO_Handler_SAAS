import { describe, it, expect } from "vitest";
import { iconForServiceType } from "@/lib/serviceIconMap";
import { ServiceIcons } from "@/components/helix/ServiceIcons";

describe("iconForServiceType", () => {
  it("always returns a key that exists in the Helix ServiceIcons catalog", () => {
    // Contract the consumer (VisitCard / FlightCard services strip) depends on:
    // whatever this function returns can be passed to <ServicePip service=…>.
    // If someone removes the fallback or types a missing key, that strip
    // would render nothing — silent regression. This test guards against it.
    const validKeys = Object.keys(ServiceIcons);
    expect(validKeys).toContain(iconForServiceType("CATERING"));
    expect(validKeys).toContain(iconForServiceType("FUTURE_UNKNOWN_SERVICE"));
    expect(validKeys).toContain(iconForServiceType(""));
  });
});
