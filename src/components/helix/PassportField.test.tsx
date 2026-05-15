// @vitest-environment happy-dom

import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "@/test/rtl";
import { PassportField } from "./PassportField";

describe("PassportField", () => {
  it("shows 'sin pasaporte' and a lock when no value is provided", () => {
    // No passport on file is a state the handler cares about (gendec
    // needs filling in). It must be visible, not blank.
    render(<PassportField value={null} />);
    expect(screen.getByText(/sin pasaporte/i)).toBeTruthy();
  });

  it("masks the passport number by default", () => {
    // PII protection — printed handouts and over-the-shoulder glances
    // should not expose passport numbers without an explicit reveal.
    const real = "AB1234567";
    const { container } = render(<PassportField value={real} />);
    expect(container.textContent).not.toContain(real);
    expect(container.textContent).toMatch(/•/);
  });

  it("reveals the real number when the user clicks the field", async () => {
    // Handler boarding the flight clicks once to read the number for the
    // gendec, then clicks again to hide. Symmetric reveal/hide.
    const real = "X9988776";
    render(<PassportField value={real} />);
    const btn = screen.getByRole("button");
    await userEvent.click(btn);
    expect(screen.getByText(real)).toBeTruthy();
    await userEvent.click(btn);
    expect(screen.queryByText(real)).toBeNull();
  });

  it("shows the source tag when provenance is non-manual", () => {
    // NETJETS / EJU / VISTAJET-sourced PII has more trust than manual; the
    // tag tells the handler "I didn't type this myself" before signing.
    render(<PassportField value="ABC123" source="NETJETS" />);
    expect(screen.getByText("NETJETS")).toBeTruthy();
  });

  it("hides the source tag for manually-entered PII", () => {
    // Manual is the default; tagging every manual row would be visual noise.
    render(<PassportField value="ABC123" source="MANUAL" />);
    expect(screen.queryByText("MANUAL")).toBeNull();
  });

  it("does not bubble the reveal click to the parent card", async () => {
    // VisitCard click selects the card; clicking the passport field must
    // ONLY toggle reveal, never select.
    const onCardClick = vi.fn();
    render(
      <div onClick={onCardClick}>
        <PassportField value="ZZ999" />
      </div>
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onCardClick).not.toHaveBeenCalled();
  });

  it("is keyboard-activatable for handlers on keyboard-only workflows", async () => {
    const real = "K1234";
    render(<PassportField value={real} />);
    const btn = screen.getByRole("button");
    btn.focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByText(real)).toBeTruthy();
  });
});
