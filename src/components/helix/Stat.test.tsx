// @vitest-environment happy-dom

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@/test/rtl";
import { Stat } from "./Stat";

describe("<Stat>", () => {
  it("renders a <div> when no onClick is provided", () => {
    const { container } = render(<Stat label="Vuelos" value={5} />);
    const root = container.firstChild as HTMLElement;
    expect(root.tagName).toBe("DIV");
    // No button role at all.
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders a <button> and fires onClick when onClick is provided", () => {
    const spy = vi.fn();
    render(
      <Stat label="Retrasados" value={3} tone="alert" onClick={spy} />,
    );
    const btn = screen.getByRole("button", { name: "Retrasados" });
    expect(btn.tagName).toBe("BUTTON");
    fireEvent.click(btn);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
