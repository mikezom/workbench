import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { LatexRenderer } from "./latex-renderer";

// Note: KaTeX rendering in happy-dom may not produce full HTML,
// but we can test that the component renders without crashing

describe("LatexRenderer", () => {
  it("renders plain text without modification", () => {
    const { container } = render(<LatexRenderer content="Hello world" />);
    expect(container.textContent).toContain("Hello world");
  });

  it("renders without crashing on inline LaTeX", () => {
    const { container } = render(
      <LatexRenderer content="The formula $x^2$ is quadratic" />
    );
    expect(container.textContent).toContain("The formula");
    expect(container.textContent).toContain("is quadratic");
  });

  it("renders without crashing on block LaTeX", () => {
    const { container } = render(
      <LatexRenderer content="Below is the equation:\n$$E = mc^2$$\nAbove was Einstein's equation." />
    );
    expect(container.textContent).toContain("Below is the equation:");
  });

  it("handles invalid LaTeX gracefully", () => {
    const { container } = render(
      <LatexRenderer content="Bad math: $\invalid{$ end" />
    );
    expect(container.textContent).toBeTruthy();
  });

  it("renders markdown formatting", () => {
    const { container } = render(
      <LatexRenderer content="**bold** and *italic*" />
    );
    expect(container.textContent).toContain("bold");
    expect(container.textContent).toContain("italic");
  });
});
