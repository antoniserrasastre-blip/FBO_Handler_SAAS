// @vitest-environment happy-dom

import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent, within } from "@/test/rtl";
import { VisitCard } from "./VisitCard";
import { makeFlight, makeService } from "@/test/factories";

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
});

describe("VisitCard selection", () => {
  it("fires onSelect with the visit id when the card is clicked", async () => {
    const onSelect = vi.fn();
    render(<VisitCard flight={makeFlight({ id: "v-42" })} onSelect={onSelect} />);
    // Click on the hero — anywhere on the card outside of nested buttons
    await userEvent.click(screen.getByText("NJE123CK"));
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
