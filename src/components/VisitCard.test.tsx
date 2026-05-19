// @vitest-environment happy-dom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, userEvent, within } from "@/test/rtl";
import { VisitCard } from "./VisitCard";
import { makeFlight, makeService } from "@/test/factories";
import type { LostItem } from "@/types/compat";

describe("VisitCard hero", () => {
  it("shows the callsign and registration on the hero", () => {
    render(<VisitCard flight={makeFlight({ callsign: "NJE721CK", registration: "CS-DXX" })} />);
    expect(screen.getByText("NJE721CK")).toBeTruthy();
    expect(screen.getByText("CS-DXX")).toBeTruthy();
  });

  it("does not show category pills for a vanilla commercial flight", () => {
    // Default visit: COMMERCIAL, not modified, not overnight, 0 pets, manual
    // pax source. The hero should be quiet.
    render(<VisitCard flight={makeFlight()} />);
    expect(screen.queryByText(/ferry/i)).toBeNull();
    expect(screen.queryByText(/cancelado/i)).toBeNull();
    expect(screen.queryByText(/pernocta/i)).toBeNull();
    expect(screen.queryByText(/modificado/i)).toBeNull();
  });

  it("renders FERRY when the visit is a repositioning leg", () => {
    render(<VisitCard flight={makeFlight({ flightCategory: "FERRY" })} />);
    expect(screen.getByText(/ferry/i)).toBeTruthy();
  });

  it("renders the cancelled state visibly", () => {
    render(<VisitCard flight={makeFlight({ flightCategory: "CANCELLED" })} />);
    expect(screen.getByText(/cancelado/i)).toBeTruthy();
  });

  it("renders the overnight pill when isOvernight is true", () => {
    render(<VisitCard flight={makeFlight({ isOvernight: true })} />);
    expect(screen.getByText(/pernocta/i)).toBeTruthy();
  });

  it("falls back to date comparison when isOvernight is unset but ARR and DEP dates differ", () => {
    render(
      <VisitCard
        flight={makeFlight({
          isOvernight: false,
          arrivalDate: "14/05/26",
          departureDate: "15/05/26",
        })}
      />
    );
    expect(screen.getByText(/pernocta/i)).toBeTruthy();
  });

  it("surfaces the pet count when the visit carries animals", () => {
    render(<VisitCard flight={makeFlight({ petCount: 2 })} />);
    expect(screen.getByTitle(/2 mascotas/i)).toBeTruthy();
  });

  it("shows the rqstNumber as a chip for NetJets visits", () => {
    render(<VisitCard flight={makeFlight({ rqstNumber: "P-9988" })} />);
    expect(screen.getByText("#P-9988")).toBeTruthy();
  });
});

describe("VisitCard movements", () => {
  it("renders an ARR row and a DEP row", () => {
    render(<VisitCard flight={makeFlight()} />);
    expect(screen.getByText("ARR")).toBeTruthy();
    expect(screen.getByText("DEP")).toBeTruthy();
  });

  it("shows the origin on the ARR row and destination on the DEP row", () => {
    const { container } = render(
      <VisitCard
        flight={makeFlight({ origin: "LFPB", destination: "EGGW", eta: "08:30", etd: "11:00" })}
      />
    );
    expect(container.textContent).toContain("LFPB");
    expect(container.textContent).toContain("EGGW");
    expect(container.textContent).toContain("08:30");
    expect(container.textContent).toContain("11:00");
  });

  it("surfaces arrivalDate on the ARR row when it differs from the sheet date", () => {
    render(
      <VisitCard
        sheetDate="15/05/26"
        flight={makeFlight({ arrivalDate: "14/05/26", departureDate: "15/05/26", isOvernight: true })}
      />
    );
    expect(screen.getByText("14/05/26")).toBeTruthy();
  });
});

describe("VisitCard clipboard", () => {
  function withMockClipboard(): { writeText: ReturnType<typeof vi.fn>; restore: () => void } {
    const writeText = vi.fn();
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    return {
      writeText,
      restore: () => {
        if (descriptor) Object.defineProperty(navigator, "clipboard", descriptor);
      },
    };
  }

  it("copies the registration to the clipboard when the aircraft badge is clicked", async () => {
    const { writeText, restore } = withMockClipboard();
    try {
      render(<VisitCard flight={makeFlight({ registration: "CS-DXX" })} />);
      await userEvent.click(screen.getByText("CS-DXX"));
      expect(writeText).toHaveBeenCalledWith("CS-DXX");
    } finally {
      restore();
    }
  });

  it("copies the callsign to the clipboard when the callsign is clicked", async () => {
    const { writeText, restore } = withMockClipboard();
    try {
      render(<VisitCard flight={makeFlight({ callsign: "NJE721CK" })} />);
      await userEvent.click(screen.getByText("NJE721CK"));
      expect(writeText).toHaveBeenCalledWith("NJE721CK");
    } finally {
      restore();
    }
  });
});

describe("VisitCard selection", () => {
  it("fires onSelect with the visit id when the card is clicked", async () => {
    const onSelect = vi.fn();
    const { container } = render(
      <VisitCard flight={makeFlight({ id: "v-42" })} onSelect={onSelect} />
    );
    // Click on a neutral hero area (state pill, no own handler) so the bubble
    // reaches the article. The callsign and badges all stopPropagation.
    await userEvent.click(container.querySelector(".hx-state-pill")!);
    expect(onSelect).toHaveBeenCalledWith("v-42");
  });

  it("applies the .selected class when isSelected is true", () => {
    const { container } = render(
      <VisitCard flight={makeFlight()} isSelected />
    );
    const card = container.querySelector(".hx-visit-card");
    expect(card?.className).toMatch(/selected/);
  });
});

describe("VisitCard services strip", () => {
  it("does not render the services strip when there are no services", () => {
    const { container } = render(<VisitCard flight={makeFlight({ services: [] })} />);
    expect(container.querySelector(".services-strip")).toBeNull();
  });

  it("renders one pip per service and a delivered counter", () => {
    const services = [
      makeService({ id: "s1", type: "CATERING", state: "DELIVERED" }),
      makeService({ id: "s2", type: "WATER", state: "PENDING" }),
      makeService({ id: "s3", type: "GPU", state: "ARRIVED" }),
    ];
    const { container } = render(<VisitCard flight={makeFlight({ services })} />);
    expect(container.textContent).toMatch(/1\/3 servidos/);
  });

  it("cycles a service from PENDING → ARRIVED on click", async () => {
    const onServiceToggle = vi.fn();
    const services = [makeService({ id: "s1", type: "CATERING", state: "PENDING" })];
    const { container } = render(
      <VisitCard flight={makeFlight({ services })} onServiceToggle={onServiceToggle} />
    );
    const strip = container.querySelector(".services-strip") as HTMLElement;
    const button = within(strip).getAllByRole("button")[0];
    await userEvent.click(button);
    expect(onServiceToggle).toHaveBeenCalledWith("s1", "ARRIVED");
  });

  it("cycles from ARRIVED → DELIVERED", async () => {
    const onServiceToggle = vi.fn();
    const services = [makeService({ id: "s1", state: "ARRIVED" })];
    const { container } = render(
      <VisitCard flight={makeFlight({ services })} onServiceToggle={onServiceToggle} />
    );
    const strip = container.querySelector(".services-strip") as HTMLElement;
    await userEvent.click(within(strip).getAllByRole("button")[0]);
    expect(onServiceToggle).toHaveBeenCalledWith("s1", "DELIVERED");
  });

  it("wraps back from DELIVERED → PENDING", async () => {
    const onServiceToggle = vi.fn();
    const services = [makeService({ id: "s1", state: "DELIVERED" })];
    const { container } = render(
      <VisitCard flight={makeFlight({ services })} onServiceToggle={onServiceToggle} />
    );
    const strip = container.querySelector(".services-strip") as HTMLElement;
    await userEvent.click(within(strip).getAllByRole("button")[0]);
    expect(onServiceToggle).toHaveBeenCalledWith("s1", "PENDING");
  });

  it("a service click does not also select the card", async () => {
    const onSelect = vi.fn();
    const onServiceToggle = vi.fn();
    const services = [makeService({ id: "s1", state: "PENDING" })];
    const { container } = render(
      <VisitCard
        flight={makeFlight({ services })}
        onSelect={onSelect}
        onServiceToggle={onServiceToggle}
      />
    );
    const strip = container.querySelector(".services-strip") as HTMLElement;
    await userEvent.click(within(strip).getAllByRole("button")[0]);
    expect(onServiceToggle).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("does not fire the toggle in read-only mode", async () => {
    const onServiceToggle = vi.fn();
    const services = [makeService({ id: "s1", state: "PENDING" })];
    const { container } = render(
      <VisitCard
        flight={makeFlight({ services })}
        onServiceToggle={onServiceToggle}
        readOnly
      />
    );
    const strip = container.querySelector(".services-strip") as HTMLElement;
    await userEvent.click(within(strip).getAllByRole("button")[0]);
    expect(onServiceToggle).not.toHaveBeenCalled();
  });
});

describe("VisitCard people strip", () => {
  it("is collapsed by default — no passport fields visible", () => {
    const passengers = [
      { id: "p1", fullName: "Alice Pax", direction: "DEPARTURE", passportNumber: "PA1", status: "BOOKED", verified: false },
    ];
    render(<VisitCard flight={makeFlight()} passengers={passengers} />);
    expect(screen.queryByText("Alice Pax")).toBeNull();
  });

  it("reveals passengers when the pax/crew toggle is pressed", async () => {
    const passengers = [
      { id: "p1", fullName: "Alice Pax", direction: "DEPARTURE", passportNumber: "PA1", status: "BOOKED", verified: false },
    ];
    render(<VisitCard flight={makeFlight()} passengers={passengers} />);
    // The toggle button surfaces the pax/crew tally — click it
    const toggle = screen.getByText(/1 pax/i);
    await userEvent.click(toggle);
    expect(screen.getByText("Alice Pax")).toBeTruthy();
  });
});

describe("VisitCard signal pills + indicators", () => {
  it("shows a sticky-note indicator when the visit has notes", () => {
    render(<VisitCard flight={makeFlight({ notes: "VIP llegada anticipada" })} />);
    expect(screen.getByTitle(/vip llegada anticipada/i)).toBeTruthy();
  });

  it("does not show the sticky-note indicator when notes are empty", () => {
    render(<VisitCard flight={makeFlight({ notes: null })} />);
    expect(screen.queryByTitle(/nota/i)).toBeNull();
  });

  it("shows a count badge of pending lost items in the hero", () => {
    const lostItems = [
      { id: "l1", visitId: "v-1", description: "iPad", location: "AIRCRAFT", state: "FOUND" } as LostItem,
      { id: "l2", visitId: "v-1", description: "Reloj", location: "LOUNGE", state: "CLAIMED" } as LostItem,
      { id: "l3", visitId: "v-1", description: "Llaves", location: "RAMP", state: "DELIVERED" } as LostItem,
    ];
    render(<VisitCard flight={makeFlight({ lostItems })} />);
    // Only FOUND + CLAIMED count as pending (DELIVERED is closed)
    expect(screen.getByText(/2 objetos/i)).toBeTruthy();
  });

  it("renders a progress bar following FLIGHT_STATE_CONFIG percentage", () => {
    const { container } = render(<VisitCard flight={makeFlight({ state: "BOARDING" })} />);
    const bar = container.querySelector(".hx-progress-bar > div") as HTMLElement;
    expect(bar).toBeTruthy();
    // BOARDING is well past EXPECTED — width > 0
    expect(bar.style.width).not.toBe("0%");
  });

  it("marks the parking pill as warning when the stand is far from GA", () => {
    // Stand "02" lives in the commercial terminal — far from the GA apron.
    const { container } = render(
      <VisitCard flight={makeFlight({ parking: "02", aircraftType: "GLEX" })} />
    );
    expect(container.querySelector(".parking-warning")).toBeTruthy();
  });

  it("marks an overdue service pip with the overdue modifier class", () => {
    // isServiceOverdue compara contra `new Date()` local; fijamos la hora
    // para que el test no dependa del reloj del runner.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T10:00:00Z"));
    try {
      const services = [
        makeService({ id: "s1", type: "CATERING", state: "PENDING", scheduledAt: "00:01" }),
      ];
      const { container } = render(<VisitCard flight={makeFlight({ services })} />);
      const pipButton = container.querySelector(".services-strip button");
      expect(pipButton?.className).toMatch(/overdue/);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ─── Mobile responsive ─────────────────────────────────────────────────────

function installMatchMedia(isMobile: boolean) {
  const mql = {
    matches: isMobile,
    media: "(max-width: 640px)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  };
  Object.defineProperty(window, "matchMedia", {
    value: vi.fn().mockReturnValue(mql),
    configurable: true,
    writable: true,
  });
}

describe("VisitCard mobile layout", () => {
  afterEach(() => {
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
  });

  it("hides the Editar button on mobile (no editing affordance in the hero)", () => {
    installMatchMedia(true);
    render(<VisitCard flight={makeFlight()} onOpenDetail={() => undefined} />);
    expect(screen.queryByRole("button", { name: /editar/i })).toBeNull();
  });

  it("keeps the Editar button on desktop", () => {
    installMatchMedia(false);
    render(<VisitCard flight={makeFlight()} onOpenDetail={() => undefined} />);
    expect(screen.getByRole("button", { name: /editar/i })).toBeTruthy();
  });

  it("hides the OperatorBadge on mobile (decorative chrome)", () => {
    installMatchMedia(true);
    // NJE callsign would render the NetJets OperatorBadge text in desktop.
    const { container } = render(<VisitCard flight={makeFlight({ callsign: "NJE721CK" })} />);
    expect(container.querySelector(".hx-pill-operator")).toBeNull();
  });

  it("hides the paxSource pill on mobile", () => {
    installMatchMedia(true);
    const { container } = render(
      <VisitCard flight={makeFlight()} paxSource="NETJETS" />
    );
    expect(container.querySelector(".hx-pill-source-netjets")).toBeNull();
  });

  it("keeps the OperatorBadge on desktop", () => {
    installMatchMedia(false);
    const { container } = render(<VisitCard flight={makeFlight({ callsign: "NJE721CK" })} />);
    expect(container.querySelector(".hx-pill-operator")).not.toBeNull();
  });
});

describe("VisitCard state stepper", () => {
  it("renders the flight-state stepper inline on the card", () => {
    const { container } = render(<VisitCard flight={makeFlight({ state: "PARKED" })} onUpdate={() => undefined} />);
    expect(container.querySelector(".state-stepper")).not.toBeNull();
  });

  it("fires onUpdate with the new state when the user taps a future chip", async () => {
    const onUpdate = vi.fn();
    const { userEvent: ue } = await import("@/test/rtl");
    const user = ue.setup();
    render(<VisitCard flight={makeFlight({ id: "v-42", state: "ON_BLOCKS" })} onUpdate={onUpdate} />);
    await user.click(screen.getByRole("radio", { name: /plataforma/i }));
    expect(onUpdate).toHaveBeenCalledWith("v-42", { state: "PARKED" });
  });

  it("does not render the stepper in read-only mode", () => {
    const { container } = render(<VisitCard flight={makeFlight()} readOnly />);
    expect(container.querySelector(".state-stepper")).toBeNull();
  });
});

describe("VisitCard urgency + audit", () => {
  it("shows a TurnaroundCountdown when there is a valid ETD and the flight is on the ground", () => {
    // ETD 10 minutes from now: should render the countdown.
    const inTenMin = new Date(Date.now() + 10 * 60 * 1000)
      .toISOString()
      .slice(11, 16); // HH:MM (UTC)
    render(<VisitCard flight={makeFlight({ etd: inTenMin, state: "PARKED" })} />);
    // The countdown surfaces a tiny pill like "10m" or "0h10".
    expect(screen.getByTitle(/tiempo hasta etd/i)).toBeTruthy();
  });

  it("renders a LastModifiedBadge when eventLogs are provided", () => {
    const eventLogs = [
      {
        id: "e1",
        visitId: "v-1",
        userId: "u-1",
        action: "Servicio entregado",
        details: "GPU",
        timestamp: "2026-05-16T11:30:00Z",
        user: { name: "Antoni" },
      },
    ];
    const flightWithLogs = { ...makeFlight({ id: "v-1" }), eventLogs };
    render(<VisitCard flight={flightWithLogs as never} />);
    expect(screen.getByText(/antoni/i)).toBeTruthy();
    expect(screen.getByText(/servicio entregado/i)).toBeTruthy();
  });
});

describe("VisitCard people editor handoff", () => {
  it("offers an arrival people editor that fires onOpenPeople with direction ARRIVAL", async () => {
    const onOpenPeople = vi.fn();
    render(
      <VisitCard
        flight={makeFlight({ id: "v-1" })}
        onOpenPeople={onOpenPeople}
      />
    );
    await userEvent.click(screen.getByText(/\d+ pax · \d+ crew/i));
    await userEvent.click(screen.getByRole("button", { name: /editar personas llegada/i }));
    expect(onOpenPeople).toHaveBeenCalledWith("v-1", "ARRIVAL");
  });

  it("offers a departure people editor that fires onOpenPeople with direction DEPARTURE", async () => {
    const onOpenPeople = vi.fn();
    render(
      <VisitCard
        flight={makeFlight({ id: "v-1" })}
        onOpenPeople={onOpenPeople}
      />
    );
    await userEvent.click(screen.getByText(/\d+ pax · \d+ crew/i));
    await userEvent.click(screen.getByRole("button", { name: /editar personas salida/i }));
    expect(onOpenPeople).toHaveBeenCalledWith("v-1", "DEPARTURE");
  });
});

describe("VisitCard editing handoff", () => {
  it("offers an Editar button that routes to the detail panel", async () => {
    const onOpenDetail = vi.fn();
    render(
      <VisitCard
        flight={makeFlight({ id: "v-7" })}
        onOpenDetail={onOpenDetail}
      />
    );
    await userEvent.click(screen.getByText(/editar/i));
    expect(onOpenDetail).toHaveBeenCalledWith("v-7");
  });
});

describe("VisitCard inline edits — counts", () => {
  async function expandAndEdit(labelRegex: RegExp, currentValue: string, newValue: string) {
    await userEvent.click(screen.getByText(/\d+ pax · \d+ crew/i));
    const row = screen.getByText(labelRegex).closest("label")!;
    await userEvent.click(within(row).getByText(currentValue));
    const input = within(row).getByDisplayValue(currentValue);
    await userEvent.clear(input);
    await userEvent.type(input, newValue);
    await userEvent.tab();
  }

  it("allows editing departure pax count when expanded", async () => {
    const onUpdate = vi.fn();
    render(<VisitCard flight={makeFlight({ id: "v-1", paxDeparture: 4 })} onUpdate={onUpdate} />);
    await expandAndEdit(/pax salida/i, "4", "6");
    expect(onUpdate).toHaveBeenCalledWith("v-1", { paxDeparture: 6 });
  });

  it("allows editing arrival pax count when expanded", async () => {
    const onUpdate = vi.fn();
    render(<VisitCard flight={makeFlight({ id: "v-1", paxArrival: 3 })} onUpdate={onUpdate} />);
    await expandAndEdit(/pax llegada/i, "3", "5");
    expect(onUpdate).toHaveBeenCalledWith("v-1", { paxArrival: 5 });
  });

  it("allows editing arrival crew count when expanded", async () => {
    const onUpdate = vi.fn();
    render(<VisitCard flight={makeFlight({ id: "v-1", crewArrival: 2 })} onUpdate={onUpdate} />);
    await expandAndEdit(/crew llegada/i, "2", "3");
    expect(onUpdate).toHaveBeenCalledWith("v-1", { crewArrival: 3 });
  });

  it("allows editing departure crew count when expanded", async () => {
    const onUpdate = vi.fn();
    render(<VisitCard flight={makeFlight({ id: "v-1", crewDeparture: 2 })} onUpdate={onUpdate} />);
    await expandAndEdit(/crew salida/i, "2", "3");
    expect(onUpdate).toHaveBeenCalledWith("v-1", { crewDeparture: 3 });
  });

  it("allows editing arrival checked bags when expanded", async () => {
    const onUpdate = vi.fn();
    render(<VisitCard flight={makeFlight({ id: "v-1", paxArrBagsChecked: 0 })} onUpdate={onUpdate} />);
    await expandAndEdit(/maletas bodega llegada/i, "0", "4");
    expect(onUpdate).toHaveBeenCalledWith("v-1", { paxArrBagsChecked: 4 });
  });

  it("allows editing arrival cabin bags when expanded", async () => {
    const onUpdate = vi.fn();
    render(<VisitCard flight={makeFlight({ id: "v-1", paxArrBagsCabin: 0 })} onUpdate={onUpdate} />);
    await expandAndEdit(/maletas cabina llegada/i, "0", "2");
    expect(onUpdate).toHaveBeenCalledWith("v-1", { paxArrBagsCabin: 2 });
  });

  it("allows editing departure checked bags when expanded", async () => {
    const onUpdate = vi.fn();
    render(<VisitCard flight={makeFlight({ id: "v-1", paxDepBagsChecked: 0 })} onUpdate={onUpdate} />);
    await expandAndEdit(/maletas bodega salida/i, "0", "5");
    expect(onUpdate).toHaveBeenCalledWith("v-1", { paxDepBagsChecked: 5 });
  });

  it("allows editing departure cabin bags when expanded", async () => {
    const onUpdate = vi.fn();
    render(<VisitCard flight={makeFlight({ id: "v-1", paxDepBagsCabin: 0 })} onUpdate={onUpdate} />);
    await expandAndEdit(/maletas cabina salida/i, "0", "1");
    expect(onUpdate).toHaveBeenCalledWith("v-1", { paxDepBagsCabin: 1 });
  });

  it("allows changing the visit state from the edit strip", async () => {
    const onUpdate = vi.fn();
    render(<VisitCard flight={makeFlight({ id: "v-1", state: "PARKED" })} onUpdate={onUpdate} />);
    await userEvent.click(screen.getByText(/\d+ pax · \d+ crew/i));
    const stateRow = screen.getByText(/^estado$/i).closest("label")!;
    const select = within(stateRow).getByRole("combobox");
    await userEvent.selectOptions(select, "TURNAROUND");
    expect(onUpdate).toHaveBeenCalledWith("v-1", { state: "TURNAROUND" });
  });

  it("sets fuelRequestedAt when fuel state goes to REQUESTED", async () => {
    const onUpdate = vi.fn();
    render(<VisitCard flight={makeFlight({ id: "v-1", fuelState: "NOT_REQUESTED" })} onUpdate={onUpdate} />);
    await userEvent.click(screen.getByText(/\d+ pax · \d+ crew/i));
    const row = screen.getByText(/^combustible$/i).closest("label")!;
    await userEvent.selectOptions(within(row).getByRole("combobox"), "REQUESTED");
    const call = onUpdate.mock.calls[0]![1] as { fuelState: string; fuelRequestedAt?: string };
    expect(call.fuelState).toBe("REQUESTED");
    expect(call.fuelRequestedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("sets fuelServedAt when fuel state goes to SERVED", async () => {
    const onUpdate = vi.fn();
    render(<VisitCard flight={makeFlight({ id: "v-1", fuelState: "REQUESTED" })} onUpdate={onUpdate} />);
    await userEvent.click(screen.getByText(/\d+ pax · \d+ crew/i));
    const row = screen.getByText(/^combustible$/i).closest("label")!;
    await userEvent.selectOptions(within(row).getByRole("combobox"), "SERVED");
    const call = onUpdate.mock.calls[0]![1] as { fuelState: string; fuelServedAt?: string };
    expect(call.fuelState).toBe("SERVED");
    expect(call.fuelServedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("sets toiletRequestedAt when toilet state goes to REQUESTED", async () => {
    const onUpdate = vi.fn();
    render(<VisitCard flight={makeFlight({ id: "v-1", toiletState: "NOT_REQUESTED" })} onUpdate={onUpdate} />);
    await userEvent.click(screen.getByText(/\d+ pax · \d+ crew/i));
    const row = screen.getByText(/^lavabos$/i).closest("label")!;
    await userEvent.selectOptions(within(row).getByRole("combobox"), "REQUESTED");
    const call = onUpdate.mock.calls[0]![1] as { toiletState: string; toiletRequestedAt?: string };
    expect(call.toiletState).toBe("REQUESTED");
    expect(call.toiletRequestedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("sets toiletCompletedAt when toilet state goes to COMPLETED", async () => {
    const onUpdate = vi.fn();
    render(<VisitCard flight={makeFlight({ id: "v-1", toiletState: "REQUESTED" })} onUpdate={onUpdate} />);
    await userEvent.click(screen.getByText(/\d+ pax · \d+ crew/i));
    const row = screen.getByText(/^lavabos$/i).closest("label")!;
    await userEvent.selectOptions(within(row).getByRole("combobox"), "COMPLETED");
    const call = onUpdate.mock.calls[0]![1] as { toiletState: string; toiletCompletedAt?: string };
    expect(call.toiletState).toBe("COMPLETED");
    expect(call.toiletCompletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("allows editing notes inline", async () => {
    const onUpdate = vi.fn();
    render(<VisitCard flight={makeFlight({ id: "v-1", notes: "" })} onUpdate={onUpdate} />);
    await userEvent.click(screen.getByText(/\d+ pax · \d+ crew/i));
    const row = screen.getByText(/^notas$/i).closest("label")!;
    // InlineTextEdit: click empty placeholder → input
    await userEvent.click(within(row).getByTitle(/click para editar/i));
    const input = within(row).getByRole("textbox");
    await userEvent.type(input, "VIP arriving late");
    await userEvent.tab();
    expect(onUpdate).toHaveBeenCalledWith("v-1", { notes: "VIP arriving late" });
  });

  it("allows editing parking inline", async () => {
    const onUpdate = vi.fn();
    render(<VisitCard flight={makeFlight({ id: "v-1", parking: "P-12" })} onUpdate={onUpdate} />);
    await userEvent.click(screen.getByText(/\d+ pax · \d+ crew/i));
    const row = screen.getByText(/^parking$/i).closest("label")!;
    await userEvent.click(within(row).getByText("P-12"));
    const input = within(row).getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "P-7");
    await userEvent.tab();
    expect(onUpdate).toHaveBeenCalledWith("v-1", { parking: "P-7" });
  });

  it("allows editing TOBT inline", async () => {
    const onUpdate = vi.fn();
    render(<VisitCard flight={makeFlight({ id: "v-1", tobt: null })} onUpdate={onUpdate} />);
    await userEvent.click(screen.getByText(/\d+ pax · \d+ crew/i));
    const row = screen.getByText(/^tobt$/i).closest("label")!;
    await userEvent.click(within(row).getByTitle(/click para editar/i));
    const input = within(row).getByRole("textbox");
    await userEvent.type(input, "10:45");
    await userEvent.tab();
    expect(onUpdate).toHaveBeenCalledWith("v-1", { tobt: "10:45" });
  });

  it("propagates ETA edits from the ARR movement row to onUpdate", async () => {
    const onUpdate = vi.fn();
    render(<VisitCard flight={makeFlight({ id: "v-1", eta: "08:00" })} onUpdate={onUpdate} />);
    await userEvent.click(screen.getByText("08:00"));
    const input = screen.getByDisplayValue("08:00");
    await userEvent.clear(input);
    await userEvent.type(input, "0915");
    await userEvent.tab();
    expect(onUpdate).toHaveBeenCalledWith("v-1", { eta: "09:15" });
  });

  it("propagates ETD edits from the DEP movement row to onUpdate", async () => {
    const onUpdate = vi.fn();
    render(<VisitCard flight={makeFlight({ id: "v-1", etd: "10:30" })} onUpdate={onUpdate} />);
    await userEvent.click(screen.getByText("10:30"));
    const input = screen.getByDisplayValue("10:30");
    await userEvent.clear(input);
    await userEvent.type(input, "1145");
    await userEvent.tab();
    expect(onUpdate).toHaveBeenCalledWith("v-1", { etd: "11:45" });
  });

  it("allows adding a service from the edit strip", async () => {
    const onAddService = vi.fn();
    render(
      <VisitCard
        flight={makeFlight({ id: "v-1" })}
        onUpdate={vi.fn()}
        onAddService={onAddService}
      />
    );
    await userEvent.click(screen.getByText(/\d+ pax · \d+ crew/i));
    await userEvent.click(screen.getByRole("button", { name: /añadir servicio/i }));
    // Choose CATERING from the picker
    await userEvent.click(screen.getByRole("button", { name: /^catering$/i }));
    expect(onAddService).toHaveBeenCalledWith("v-1", "CATERING");
  });

  it("allows deleting a service from the edit strip", async () => {
    const onDeleteService = vi.fn();
    const services = [makeService({ id: "s1", type: "CATERING", state: "PENDING" })];
    render(
      <VisitCard
        flight={makeFlight({ id: "v-1", services })}
        onUpdate={vi.fn()}
        onDeleteService={onDeleteService}
      />
    );
    await userEvent.click(screen.getByText(/\d+ pax · \d+ crew/i));
    // Find the delete button next to the CATERING entry in the edit strip
    await userEvent.click(screen.getByRole("button", { name: /eliminar catering/i }));
    expect(onDeleteService).toHaveBeenCalledWith("s1");
  });

  it("allows adding a lost item from the edit strip", async () => {
    const onAddLostItem = vi.fn();
    render(
      <VisitCard
        flight={makeFlight({ id: "v-1" })}
        onUpdate={vi.fn()}
        onAddLostItem={onAddLostItem}
      />
    );
    await userEvent.click(screen.getByText(/\d+ pax · \d+ crew/i));
    const descInput = screen.getByPlaceholderText(/descripción del objeto/i);
    await userEvent.type(descInput, "iPad gris");
    await userEvent.click(screen.getByRole("button", { name: /añadir objeto/i }));
    expect(onAddLostItem).toHaveBeenCalledWith("v-1", "iPad gris", "AIRCRAFT");
  });

  it("allows toggling a lost item state from the edit strip", async () => {
    const onLostItemToggle = vi.fn();
    const lostItems = [
      { id: "l1", visitId: "v-1", description: "iPad gris", location: "AIRCRAFT", state: "FOUND" } as LostItem,
    ];
    render(
      <VisitCard
        flight={makeFlight({ id: "v-1", lostItems })}
        onUpdate={vi.fn()}
        onLostItemToggle={onLostItemToggle}
      />
    );
    await userEvent.click(screen.getByText(/\d+ pax · \d+ crew/i));
    const row = screen.getByText("iPad gris").closest("li")!;
    await userEvent.selectOptions(within(row).getByRole("combobox"), "CLAIMED");
    expect(onLostItemToggle).toHaveBeenCalledWith("l1", "CLAIMED");
  });

  it("allows deleting a lost item from the edit strip", async () => {
    const onDeleteLostItem = vi.fn();
    const lostItems = [
      { id: "l1", visitId: "v-1", description: "iPad gris", location: "AIRCRAFT", state: "FOUND" } as LostItem,
    ];
    render(
      <VisitCard
        flight={makeFlight({ id: "v-1", lostItems })}
        onUpdate={vi.fn()}
        onDeleteLostItem={onDeleteLostItem}
      />
    );
    await userEvent.click(screen.getByText(/\d+ pax · \d+ crew/i));
    await userEvent.click(screen.getByRole("button", { name: /eliminar ipad gris/i }));
    expect(onDeleteLostItem).toHaveBeenCalledWith("l1");
  });

  it("fires onDelete with confirmation when the delete button is clicked", async () => {
    const onDelete = vi.fn();
    const original = window.confirm;
    window.confirm = vi.fn(() => true);
    try {
      render(
        <VisitCard
          flight={makeFlight({ id: "v-1" })}
          onUpdate={vi.fn()}
          onDelete={onDelete}
        />
      );
      await userEvent.click(screen.getByText(/\d+ pax · \d+ crew/i));
      await userEvent.click(screen.getByRole("button", { name: /eliminar vuelo/i }));
      expect(onDelete).toHaveBeenCalledWith("v-1");
    } finally {
      window.confirm = original;
    }
  });

  it("does not call onDelete when the user cancels the confirmation", async () => {
    const onDelete = vi.fn();
    const original = window.confirm;
    window.confirm = vi.fn(() => false);
    try {
      render(
        <VisitCard
          flight={makeFlight({ id: "v-1" })}
          onUpdate={vi.fn()}
          onDelete={onDelete}
        />
      );
      await userEvent.click(screen.getByText(/\d+ pax · \d+ crew/i));
      await userEvent.click(screen.getByRole("button", { name: /eliminar vuelo/i }));
      expect(onDelete).not.toHaveBeenCalled();
    } finally {
      window.confirm = original;
    }
  });

  it("hides the edit strip in readOnly mode", async () => {
    const onUpdate = vi.fn();
    render(
      <VisitCard
        flight={makeFlight({ id: "v-1", paxDeparture: 4 })}
        onUpdate={onUpdate}
        readOnly
      />
    );
    await userEvent.click(screen.getByText(/\d+ pax · \d+ crew/i));
    expect(screen.queryByText(/pax salida/i)).toBeNull();
  });
});
