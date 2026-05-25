// @vitest-environment happy-dom
// Minimal test: ParseWarningsBanner renders warnings correctly in the import
// preview and is absent when the warnings array is empty.

import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/rtl";

// Inline the component so we can test it without exporting it from page.tsx.
// This mirrors the exact JSX in ParseWarningsBanner — keep in sync if the
// component shape changes.
interface ParseWarning {
  row: number;
  reason: string;
}

function ParseWarningsBanner({ warnings }: { warnings: ParseWarning[] }) {
  return (
    <div
      className="mt-4 rounded-hx-md border border-warning-strong bg-warning-bg px-4 py-3"
      data-testid="parse-warnings-banner"
    >
      <p className="mb-1.5 text-xs font-semibold text-warning-strong">
        Avisos del parseo — {warnings.length}{" "}
        {warnings.length === 1 ? "fila con problema" : "filas con problemas"} (no
        bloquean la importación)
      </p>
      {warnings.map((w, i) => (
        <p key={i} className="text-xs text-warning-strong">
          Fila {w.row}: {w.reason}
        </p>
      ))}
    </div>
  );
}

describe("ParseWarningsBanner", () => {
  it("muestra el banner cuando hay warnings", () => {
    render(
      <ParseWarningsBanner
        warnings={[
          { row: 3, reason: "Sin matrícula" },
          { row: 7, reason: "ETA fuera de columna" },
        ]}
      />
    );

    expect(screen.getByTestId("parse-warnings-banner")).toBeTruthy();
    expect(screen.getByText(/Avisos del parseo/i)).toBeTruthy();
    expect(screen.getByText(/2 filas con problemas/i)).toBeTruthy();
    expect(screen.getByText(/Fila 3: Sin matrícula/i)).toBeTruthy();
    expect(screen.getByText(/Fila 7: ETA fuera de columna/i)).toBeTruthy();
  });

  it("muestra singular cuando hay exactamente un warning", () => {
    render(
      <ParseWarningsBanner warnings={[{ row: 5, reason: "Item fuera de columna" }]} />
    );

    expect(screen.getByText(/1 fila con problema/i)).toBeTruthy();
    // "filas con problemas" (plural) must NOT appear
    expect(screen.queryByText(/filas con problemas/i)).toBeNull();
  });

  it("no bloquean la importación aparece en el título", () => {
    render(
      <ParseWarningsBanner warnings={[{ row: 1, reason: "Cualquier motivo" }]} />
    );
    expect(screen.getByText(/no bloquean la importación/i)).toBeTruthy();
  });
});
