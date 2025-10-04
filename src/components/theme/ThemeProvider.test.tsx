import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider, THEME_STORAGE_KEY, useTheme } from "@/components/theme/ThemeProvider";

function createMatchMedia(matches: boolean) {
  return vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as MediaQueryList));
}

function ThemeReporter() {
  const { theme } = useTheme();
  return <span data-testid="theme-value">{theme}</span>;
}

function ThemeToggleButton() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button type="button" onClick={() => toggleTheme()}>
      toggle-{theme}
    </button>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-theme");
    document.body.innerHTML = "";
  });

  afterEach(() => {
    cleanup();
  });

  it("defaults to the system dark preference and toggles themes", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: createMatchMedia(true),
    });

    const { getByTestId, getByRole } = render(
      <ThemeProvider>
        <ThemeReporter />
        <ThemeToggleButton />
      </ThemeProvider>,
    );

    expect(getByTestId("theme-value").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("dark");

    fireEvent.click(getByRole("button", { name: /toggle/i }));

    expect(getByTestId("theme-value").textContent).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("prefers stored overrides instead of the system preference", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: createMatchMedia(true),
    });

    const { getByTestId } = render(
      <ThemeProvider>
        <ThemeReporter />
      </ThemeProvider>,
    );

    expect(getByTestId("theme-value").textContent).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
