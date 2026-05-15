// Shared test harness for React component tests. Wraps RTL with the automatic
// cleanup that vitest doesn't register when `globals: false` is set in
// vitest.config. Each component test should import `render`/`screen` from
// here instead of from @testing-library/react directly.

import { afterEach } from "vitest";
import { cleanup, render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

afterEach(() => cleanup());

export { render, screen, within, fireEvent, userEvent };
