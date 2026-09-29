import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Hero from "./Hero";

describe("Hero early-access capture", () => {
  it("shows an error when the email is invalid", async () => {
    render(
      <MemoryRouter>
        <Hero />
      </MemoryRouter>,
    );

    const input = screen.getByLabelText(/email address/i);
    await userEvent.type(input, "not-an-email");
    await userEvent.click(screen.getByRole("button", { name: /request access/i }));

    expect(await screen.findByText(/please enter a valid email address/i)).toBeInTheDocument();
  });

  it("shows the success panel when the email is valid", async () => {
    render(
      <MemoryRouter>
        <Hero />
      </MemoryRouter>,
    );

    const input = screen.getByLabelText(/email address/i);
    await userEvent.type(input, "tutor@university.edu");
    await userEvent.click(screen.getByRole("button", { name: /request access/i }));

    expect(await screen.findByText(/you're on the list/i)).toBeInTheDocument();
    expect(screen.getByText("tutor@university.edu")).toBeInTheDocument();
  });
});
