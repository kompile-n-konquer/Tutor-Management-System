import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Hero from "./Hero";

describe("Hero section", () => {
  it("renders the headline, badge and subtitle", () => {
    render(
      <MemoryRouter>
        <Hero />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/tutoring made/i);
    expect(screen.getByText(/Computer Science & Applied Mathematics/i)).toBeInTheDocument();
    expect(
      screen.getByText(/centralized platform for Computer Science and Applied Mathematics/i),
    ).toBeInTheDocument();
  });

  it("renders the trust badges", () => {
    render(
      <MemoryRouter>
        <Hero />
      </MemoryRouter>,
    );

    expect(screen.getByText("Automated Allocation")).toBeInTheDocument();
    expect(screen.getByText("Instant Timesheets")).toBeInTheDocument();
    expect(screen.getByText("CSAM Verified")).toBeInTheDocument();
  });
});
