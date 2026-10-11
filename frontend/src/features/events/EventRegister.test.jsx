import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

// Same shared mutable auth state pattern as Events.test.jsx: the page reads
// `currentUser`/`loading`, the AppLayout Sidebar reads role/userProfile/signOut.
const authState = vi.hoisted(() => ({
  role: "lecturer",
  userProfile: { firstName: "Ada", lastName: "Lovelace" },
  currentUser: { role: "lecturer", email: "ada@example.com" },
  signOut: vi.fn(),
  loading: false,
}));

const apiMock = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));

vi.mock("../context/AuthContext", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useAuth: () => authState };
});
vi.mock("../../hooks/useAuth", () => ({ default: () => authState }));
vi.mock("../../utils/axiosInstance", () => ({ default: apiMock }));
vi.mock("../../components/search/GlobalSearch", () => ({ default: () => null }));

import EventRegister from "./EventRegister.jsx";
import ThemeProvider from "../context/ThemeProvider.jsx";

function LocationProbe() {
  const { pathname } = useLocation();
  return <p>at:{pathname}</p>;
}

const renderRegister = () =>
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={["/events/12/register"]}>
        <Routes>
          <Route path="/events/:id/register" element={<EventRegister />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </ThemeProvider>,
  );

const setRole = (role) => {
  authState.role = role;
  authState.currentUser = role ? { role, email: `${role}@example.com` } : null;
  authState.userProfile = role ? { firstName: "Ada", lastName: "Lovelace" } : null;
};

const REGISTER_FIXTURE = {
  eventId: 12,
  courseCode: "CS101",
  courseName: "Intro to Programming",
  date: "2026-03-03T00:00:00.000Z",
  times: [{ startMinute: 480, endMinute: 540 }],
  tutors: [
    { id: 1, name: "Bob Tutor", email: "bob@example.com", present: true },
    { id: 2, name: "Alice Tutor", email: "alice@example.com", present: false },
  ],
};

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.put.mockReset();
  apiMock.get.mockResolvedValue({ status: 200, data: REGISTER_FIXTURE });
  apiMock.put.mockResolvedValue({ status: 200, data: { message: "Register saved" } });
  setRole("lecturer");
});

afterEach(() => {
  document.documentElement.className = "";
});

describe("EventRegister — loading and rendering", () => {
  test("renders the register with ticked tutors, timeslot chips and the live counter", async () => {
    renderRegister();

    expect(apiMock.get).toHaveBeenCalledWith("/events/12/register");
    expect(await screen.findByText("CS101 Register")).toBeInTheDocument();
    expect(
      screen.getByText((content) => content.startsWith("Intro to Programming —")),
    ).toBeInTheDocument();
    expect(screen.getByText("08:00-09:00")).toBeInTheDocument();

    expect(screen.getByLabelText("Mark Bob Tutor present")).toBeChecked();
    expect(screen.getByLabelText("Mark Alice Tutor present")).not.toBeChecked();
    expect(screen.getByText("1 of 2 marked present")).toBeInTheDocument();
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
  });

  test("shows the load error and no tutor rows when the register request fails", async () => {
    apiMock.get.mockResolvedValue({ status: 500, data: { message: "Register unavailable" } });

    renderRegister();

    expect(await screen.findByText("Register unavailable")).toBeInTheDocument();
    // register stays null, so the page keeps its generic heading
    expect(screen.getByText("Event Register")).toBeInTheDocument();
    expect(screen.queryByText("Bob Tutor")).not.toBeInTheDocument();
  });

  test("shows an empty-allocations message when the course has no tutors", async () => {
    apiMock.get.mockResolvedValue({
      status: 200,
      data: { ...REGISTER_FIXTURE, times: [], tutors: [] },
    });

    renderRegister();

    expect(await screen.findByText("CS101 Register")).toBeInTheDocument();
    expect(
      screen.getByText("No tutors have been allocated to this course yet."),
    ).toBeInTheDocument();
    expect(screen.getByText("0 of 0 marked present")).toBeInTheDocument();
  });
});

describe("EventRegister — auto-save", () => {
  test("saves immediately when a tutor is ticked and when unticked", async () => {
    renderRegister();
    await screen.findByText("CS101 Register");

    fireEvent.click(screen.getByLabelText("Mark Alice Tutor present"));

    await waitFor(() =>
      expect(apiMock.put).toHaveBeenCalledWith("/events/12/register", { presentIds: [1, 2] }),
    );
    expect(screen.getByLabelText("Mark Alice Tutor present")).toBeChecked();
    expect(screen.getByText("2 of 2 marked present")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Mark Bob Tutor present"));

    await waitFor(() =>
      expect(apiMock.put).toHaveBeenLastCalledWith("/events/12/register", { presentIds: [2] }),
    );
    expect(screen.getByLabelText("Mark Bob Tutor present")).not.toBeChecked();
    expect(screen.getByText("1 of 2 marked present")).toBeInTheDocument();
  });

  test("shows Saving... while a save is in flight", async () => {
    let releasePut;
    apiMock.put.mockImplementation(
      () =>
        new Promise((resolve) => {
          releasePut = resolve;
        }),
    );

    renderRegister();
    await screen.findByText("CS101 Register");

    fireEvent.click(screen.getByLabelText("Mark Alice Tutor present"));

    expect(await screen.findByText("Saving...")).toBeInTheDocument();

    await act(async () => {
      releasePut({ status: 200 });
    });

    expect(screen.getByText("2 of 2 marked present")).toBeInTheDocument();
  });

  test("reverts the checkbox and surfaces the message when saving fails", async () => {
    apiMock.put.mockResolvedValue({ status: 500, data: { message: "Could not save" } });

    renderRegister();
    await screen.findByText("CS101 Register");

    fireEvent.click(screen.getByLabelText("Mark Alice Tutor present"));

    expect(await screen.findByText("Could not save")).toBeInTheDocument();
    expect(screen.getByLabelText("Mark Alice Tutor present")).not.toBeChecked();
    expect(screen.getByText("1 of 2 marked present")).toBeInTheDocument();
  });
});

describe("EventRegister — role access", () => {
  test("redirects non-lecturers to their dashboard without fetching the register", async () => {
    setRole("tutor");
    renderRegister();

    expect(await screen.findByText("at:/tutor-dashboard")).toBeInTheDocument();
    expect(apiMock.get).not.toHaveBeenCalled();
    expect(document.querySelector("h2")).not.toBeInTheDocument();
  });

  test("redirects signed-out users to the login page", async () => {
    setRole(null);
    renderRegister();

    expect(await screen.findByText("at:/login")).toBeInTheDocument();
    expect(apiMock.get).not.toHaveBeenCalled();
  });
});
