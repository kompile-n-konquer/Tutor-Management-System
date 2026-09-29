import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

// Shared mutable auth state: the page itself reads `currentUser`/`loading`,
// while the Sidebar rendered by AppLayout reads `role`/`userProfile`/`signOut`.
const authState = vi.hoisted(() => ({
  role: "lecturer",
  userProfile: { firstName: "Ada", lastName: "Lovelace" },
  currentUser: { role: "lecturer", email: "ada@example.com" },
  signOut: vi.fn(),
  loading: false,
}));

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));

// Events.jsx imports the named hook straight from the context module, while
// the Sidebar goes through hooks/useAuth — both get the same state object.
vi.mock("../context/AuthContext", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useAuth: () => authState };
});
vi.mock("../../hooks/useAuth", () => ({ default: () => authState }));
vi.mock("../../utils/axiosInstance", () => ({ default: apiMock }));
// GlobalSearch fires role-scoped API requests on mount — irrelevant here.
vi.mock("../../components/search/GlobalSearch", () => ({ default: () => null }));

import Events from "./Events.jsx";
import ThemeProvider from "../context/ThemeProvider.jsx";

function LocationProbe() {
  const { pathname } = useLocation();
  return <p>at:{pathname}</p>;
}

// TopNavBar reads the active theme, so the real provider wraps the page just
// like it does in main.jsx.
const renderEvents = (initialEntries = ["/events"]) =>
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Events />
        <LocationProbe />
      </MemoryRouter>
    </ThemeProvider>,
  );

const setRole = (role) => {
  authState.role = role;
  authState.currentUser = role ? { role, email: `${role}@example.com` } : null;
  authState.userProfile = role ? { firstName: "Ada", lastName: "Lovelace" } : null;
};

// Two courses; the payload deliberately lists MATH202 first and the older
// CS101 event first so assertions prove the component's own ordering.
const EVENTS_FIXTURE = [
  {
    id: 31,
    courseId: 20,
    courseCode: "MATH202",
    courseName: "Discrete Mathematics",
    date: "2019-05-05T00:00:00.000Z",
    description: "revision session",
    lecturer: "Dr Ndlovu",
    times: [],
  },
  {
    id: 11,
    courseId: 10,
    courseCode: "CS101",
    courseName: "Intro to Programming",
    date: "2020-03-01T00:00:00.000Z",
    description: "make-up test",
    lecturer: "Dr Mokoena",
    times: [{ startMinute: 600, endMinute: 660 }],
  },
  {
    id: 12,
    courseId: 10,
    courseCode: "CS101",
    courseName: "Intro to Programming",
    date: "2099-01-05T00:00:00.000Z",
    description: "tutorial",
    lecturer: "Dr Mokoena",
    times: [{ startMinute: 480, endMinute: 540 }],
  },
];

// The events table only exists while a course card is expanded.
const bodyRows = () => screen.getAllByRole("row").filter((row) => row.querySelector("td"));
const expandButton = (code) => screen.getByRole("button", { name: new RegExp(code) });

beforeEach(() => {
  apiMock.get.mockReset();
  apiMock.get.mockResolvedValue({ status: 200, data: EVENTS_FIXTURE });
  setRole("lecturer");
});

afterEach(() => {
  document.documentElement.className = "";
});

describe("Events — skeleton loading state", () => {
  test("shows shaped skeleton rows while loading, then swaps in the course groups", async () => {
    let resolveRequest;
    apiMock.get.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );

    const { container } = renderEvents();

    expect(apiMock.get).toHaveBeenCalledWith("/events");
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(3);
    expect(screen.queryByText("CS101")).not.toBeInTheDocument();

    await act(async () => {
      resolveRequest({ status: 200, data: EVENTS_FIXTURE });
    });

    expect(await screen.findByText("CS101")).toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);
  });

  test("surfaces a load error and keeps the lecturer empty state", async () => {
    apiMock.get.mockResolvedValue({ status: 500, data: { message: "Server exploded" } });

    renderEvents();

    expect(await screen.findByText("Server exploded")).toBeInTheDocument();
    expect(screen.getByText("You have not created any events yet.")).toBeInTheDocument();
  });
});

describe("Events — course grouping", () => {
  test("renders one clickable card per course, alphabetically, with event and upcoming counts", async () => {
    renderEvents();
    await screen.findByText("CS101");

    const csCard = expandButton("CS101");
    const mathCard = expandButton("MATH202");

    // Course code, name and summary all live on the card header.
    expect(csCard).toHaveTextContent("Intro to Programming");
    expect(within(csCard).getByText("2 events · 1 upcoming")).toBeInTheDocument();
    expect(within(mathCard).getByText("1 event · 0 upcoming")).toBeInTheDocument();

    // Alphabetical by course code, independent of payload order.
    expect(
      csCard.compareDocumentPosition(mathCard) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Groups start collapsed — no event rows on screen.
    expect(csCard).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("tutorial")).not.toBeInTheDocument();
  });

  test("expands a course to show its events newest-first and collapses again", async () => {
    renderEvents();
    await screen.findByText("CS101");

    const csCard = expandButton("CS101");
    fireEvent.click(csCard);

    expect(csCard).toHaveAttribute("aria-expanded", "true");
    // The expanded panel is the element the header links to via aria-controls.
    expect(document.getElementById(csCard.getAttribute("aria-controls"))).toBeInTheDocument();

    const rows = bodyRows();
    expect(rows).toHaveLength(2);
    // Newest first: the 2099 tutorial above the 2020 make-up test.
    expect(rows[0]).toHaveTextContent("tutorial");
    expect(rows[0]).toHaveTextContent("08:00-09:00");
    expect(rows[1]).toHaveTextContent("make-up test");

    fireEvent.click(csCard);
    expect(csCard).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("tutorial")).not.toBeInTheDocument();
    expect(document.getElementById(csCard.getAttribute("aria-controls"))).not.toBeInTheDocument();
  });

  test("keeps a single course expanded at a time", async () => {
    renderEvents();
    await screen.findByText("CS101");

    const csCard = expandButton("CS101");
    const mathCard = expandButton("MATH202");

    fireEvent.click(csCard);
    expect(screen.getByText("tutorial")).toBeInTheDocument();

    fireEvent.click(mathCard);
    expect(csCard).toHaveAttribute("aria-expanded", "false");
    expect(mathCard).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByText("tutorial")).not.toBeInTheDocument();
    expect(screen.getByText("revision session")).toBeInTheDocument();
    // A weekday with no matching timeslot says so instead of rendering a chip.
    expect(screen.getByText("No timeslot on this weekday")).toBeInTheDocument();
  });

  test("navigates to the event details when a row is clicked", async () => {
    renderEvents();
    await screen.findByText("CS101");
    fireEvent.click(expandButton("CS101"));

    fireEvent.click(bodyRows()[0]);

    expect(screen.getByText("at:/events/12")).toBeInTheDocument();
  });
});

describe("Events — role access", () => {
  test("lecturers can create events from the page header", async () => {
    renderEvents();
    await screen.findByText("CS101");

    fireEvent.click(screen.getByRole("button", { name: /create event/i }));

    expect(screen.getByText("at:/events/add")).toBeInTheDocument();
  });

  test("tutors see the grouped events but no Create Event action", async () => {
    setRole("tutor");
    renderEvents();

    expect(await screen.findByText("CS101")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create event/i })).not.toBeInTheDocument();
  });

  test("students are redirected to their dashboard without loading events", async () => {
    setRole("student");
    renderEvents();

    expect(await screen.findByText("at:/tutor-dashboard")).toBeInTheDocument();
    expect(apiMock.get).not.toHaveBeenCalled();
    // The page itself never rendered.
    expect(document.querySelector("h2")).not.toBeInTheDocument();
  });
});
