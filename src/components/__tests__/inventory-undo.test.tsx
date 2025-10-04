import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { NaturalEssenceCraftingApp } from "../NaturalEssenceCraftingApp";

describe("inventory manual edits", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("can be undone immediately without losing the original snapshot", () => {
    render(
      <NaturalEssenceCraftingApp compactMode={false} onToggleCompactMode={() => {}} />,
    );

    const rawInput = screen.getByLabelText("T1 Raw") as HTMLInputElement;
    const undoButton = screen.getByRole("button", { name: /undo/i });

    expect(rawInput.value).toBe("0");

    fireEvent.change(rawInput, { target: { value: "10" } });
    expect(rawInput.value).toBe("10");

    fireEvent.change(rawInput, { target: { value: "5" } });
    expect(rawInput.value).toBe("5");

    fireEvent.click(undoButton);
    expect(rawInput.value).toBe("0");

    fireEvent.change(rawInput, { target: { value: "3" } });
    expect(rawInput.value).toBe("3");

    fireEvent.click(undoButton);
    expect(rawInput.value).toBe("0");
  });
});
