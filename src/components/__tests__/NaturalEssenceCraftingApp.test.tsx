import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { NaturalEssenceCraftingApp } from "../NaturalEssenceCraftingApp";

function renderApp() {
  return render(
    <NaturalEssenceCraftingApp compactMode={false} onToggleCompactMode={() => {}} />,
  );
}

function enableManualMode() {
  const [toggle] = screen.getAllByRole("switch", { name: "Toggle auto rolling" });
  fireEvent.click(toggle);
}

function commitManualInput(label: string, value: string) {
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
  return input;
}

describe("NaturalEssenceCraftingApp dice overlay", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("records the final attempt when running batch actions", async () => {
    renderApp();

    commitManualInput("T1 Raw", "10");
    enableManualMode();

    commitManualInput("Manual check rolls (comma separated)", "1,20");
    commitManualInput("Manual salvage rolls (comma separated)", "5");

    const batchInput = screen.getByLabelText("Batch size", { selector: "input" });
    fireEvent.change(batchInput, { target: { value: "2" } });

    const runButtonText = await screen.findByText("Run batch (2)");
    const runButton = runButtonText.closest("button");
    expect(runButton).toBeTruthy();
    fireEvent.click(runButton!);

    const checkLabel = await screen.findByText("T2 standard check");
    const checkCard = checkLabel.parentElement;

    expect(checkCard).toBeTruthy();
    expect(within(checkCard as HTMLElement).getByText("20")).toBeDefined();
    expect(screen.queryByText("T2 standard salvage")).toBeNull();
  });

  it("shows check and salvage rolls for salvage-only runs and keeps the overlay visible", async () => {
    renderApp();

    commitManualInput("T1 Raw", "10");
    enableManualMode();

    const manualChecks = commitManualInput("Manual check rolls (comma separated)", "1");
    commitManualInput("Manual salvage rolls (comma separated)", "15");

    const batchInput = screen.getByLabelText("Batch size", { selector: "input" });
    fireEvent.change(batchInput, { target: { value: "1" } });

    const runButton = screen
      .getAllByRole("button")
      .find((btn) => btn.textContent?.includes("Run batch"));
    expect(runButton).toBeDefined();
    fireEvent.click(runButton!);

    const checkLabel = await screen.findByText("T2 standard check");
    const salvageLabel = await screen.findByText("T2 standard salvage");

    const checkCard = checkLabel.parentElement as HTMLElement;
    const salvageCard = salvageLabel.parentElement as HTMLElement;

    expect(within(checkCard).getByText(/Fail/i)).toBeDefined();
    expect(within(salvageCard).getByText(/Success/i)).toBeDefined();

    fireEvent.change(manualChecks, { target: { value: "2" } });
    fireEvent.blur(manualChecks);

    expect(screen.getByText("T2 standard salvage")).toBeDefined();
  });
});
