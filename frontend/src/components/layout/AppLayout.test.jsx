import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

// Shared mutable auth state so each test can pick the signed-in role.
const authState = vi.hoisted(() => ({
  role: "organiser",
  userProfile: { firstName: "Alex", lastName: "Organiser", email: "alex@example.com" },
  currentUser: { email: "alex@example.com" },
  signOut: vi.fn(),
}));
vi.mock("../../hooks/useAuth", () => ({ default: () => authState }));
// GlobalSearch fires role-scoped API requests on mount — irrelevant to layout wiring.
vi.mock("../search/GlobalSearch", () => ({ default: () => null }));

import AppLayout from "./AppLayout.jsx";
import ThemeProvider from "../../features/context/ThemeProvider.jsx";
import { NAV_LINKS, FOOTER_LINKS } from "../../config/navConfig";

// jsdom does not implement window.matchMedia, so each test installs a stub and
// the afterEach hooks remove it again. AppLayout subscribes to the
// (min-width: 768px) query to choose between the docked sidebar and the
// overlay drawer; the prefers-color-scheme probe from ThemeProvider stays
// false either way.
function setViewport({ desktop }) {
  // One MediaQueryList per query, like a real browser — the layout subscribes
  // to its query once and reacts to later "change" events.
  const queries = {};
  window.matchMedia = vi.fn((query) => {
    if (!queries[query]) {
      queries[query] = {
        matches: desktop && query.includes("min-width"),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
    }
    return queries[query];
  });
  return queries;
}

// Renders the current route so tests can prove a sidebar link both navigates
// and settles the sidebar state in the same click.
function LocationProbe() {
  const { pathname } = useLocation();
  return <p>at:{pathname}</p>;
}

const renderLayout = (initialEntries) =>
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <AppLayout>
          <LocationProbe />
        </AppLayout>
      </MemoryRouter>
    </ThemeProvider>,
  );

const sidebarElement = () => document.querySelector("#app-sidebar");
// The hamburger is the only menu button wired to the sidebar via aria-controls;
// the drawer's own "Close menu" button shares the label while it is open.
const menuButton = () =>
  screen
    .getAllByRole("button", { name: /menu/i })
    .find((button) => button.getAttribute("aria-controls") === "app-sidebar");
const contentColumn = () => document.querySelector("main").parentElement;

describe("AppLayout docked sidebar (md+)", () => {
  beforeEach(() => {
    authState.role = "organiser";
    authState.signOut.mockClear();
  });

  afterEach(() => {
    delete window.matchMedia;
    document.documentElement.className = "";
  });

  test("responds to the viewport shrinking below md without a remount", () => {
    const queries = setViewport({ desktop: true });
    renderLayout();

    const sidebar = sidebarElement();
    expect(sidebar).toHaveClass("translate-x-0");

    // The layout listens for live media-query changes: resizing below the md
    // breakpoint swaps the docked panel for the hidden overlay drawer.
    const mql = queries["(min-width: 768px)"];
    const changeListener = mql.addEventListener.mock.calls
      .filter(([event]) => event === "change")
      .map(([, handler]) => handler)[0];
    expect(changeListener).toBeTypeOf("function");

    act(() => changeListener({ matches: false }));

    expect(sidebarElement()).toHaveClass("-translate-x-full");
    expect(sidebarElement()).toHaveAttribute("inert");
    expect(contentColumn()).toHaveClass("ml-0");
    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
  });

  test("renders the docked sidebar expanded and grouped into sections", () => {
    setViewport({ desktop: true });
    renderLayout();

    const sidebar = sidebarElement();
    expect(sidebar).toHaveClass("translate-x-0", "w-sidebar-width");
    expect(sidebar).not.toHaveAttribute("inert");

    // Section headings from the navConfig grouping.
    expect(screen.getByText("Main Menu")).toBeInTheDocument();
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("Account")).toBeInTheDocument();

    // Role links keep their icons and destinations.
    const board = screen.getByText("Allocation").closest("a");
    expect(board).toHaveAttribute("href", "/organiser");
    expect(board.querySelector(".material-symbols-outlined")).toHaveTextContent("dashboard");

    // The signed-in user card sits at the bottom of the panel.
    expect(screen.getByText("Alex Organiser")).toBeInTheDocument();
    expect(screen.getByText("Organiser")).toBeInTheDocument();

    // The content column makes room for the floating panel.
    expect(contentColumn()).toHaveClass("ml-sidebar-ml");
  });

  test("the hamburger collapses to the icon rail and restores the expanded menu", () => {
    setViewport({ desktop: true });
    renderLayout();

    const hamburger = menuButton();
    expect(hamburger).toHaveAttribute("aria-expanded", "true");
    expect(hamburger).toHaveAttribute("aria-label", "Collapse menu");

    fireEvent.click(hamburger);

    expect(hamburger).toHaveAttribute("aria-expanded", "false");
    expect(hamburger).toHaveAttribute("aria-label", "Expand menu");
    expect(sidebarElement()).toHaveClass("w-sidebar-rail");
    expect(contentColumn()).toHaveClass("ml-sidebar-ml-rail");
    // Labels and section headings disappear …
    expect(screen.queryByText("Main Menu")).not.toBeInTheDocument();
    expect(screen.queryByText("Allocation")).not.toBeInTheDocument();
    // … while the icon column keeps every item.
    const expected = NAV_LINKS.filter((link) => link.roles.includes("organiser"));
    expect(sidebarElement().querySelectorAll(".material-symbols-outlined")).toHaveLength(
      expected.length + FOOTER_LINKS.length,
    );

    fireEvent.click(hamburger);

    expect(hamburger).toHaveAttribute("aria-expanded", "true");
    expect(sidebarElement()).toHaveClass("w-sidebar-width");
    expect(screen.getByText("Allocation")).toBeInTheDocument();
    expect(contentColumn()).toHaveClass("ml-sidebar-ml");
  });

  test("the active page renders as the contrasting pill", () => {
    setViewport({ desktop: true });
    renderLayout(["/courses"]);

    const active = screen.getByText("Courses").closest("a");
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active).toHaveClass("bg-sidebar-active", "text-on-sidebar-active");
  });

  test("navigation keeps the desktop sidebar docked and expanded", () => {
    setViewport({ desktop: true });
    renderLayout();

    fireEvent.click(screen.getByText("Courses"));

    expect(screen.getByText("at:/courses")).toBeInTheDocument();
    expect(sidebarElement()).toHaveClass("translate-x-0", "w-sidebar-width");
    expect(menuButton()).toHaveAttribute("aria-expanded", "true");
  });
});

describe("AppLayout overlay drawer (below md)", () => {
  beforeEach(() => {
    authState.role = "organiser";
    authState.signOut.mockClear();
  });

  afterEach(() => {
    delete window.matchMedia;
    document.documentElement.className = "";
  });

  test("starts closed, with the page content untouched", () => {
    setViewport({ desktop: false });
    renderLayout();

    expect(sidebarElement()).toHaveClass("-translate-x-full");
    expect(sidebarElement()).toHaveAttribute("inert");
    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
    expect(menuButton()).toHaveAttribute("aria-label", "Open menu");
    expect(contentColumn()).toHaveClass("ml-0");
    expect(document.querySelector("div.fixed.inset-0")).not.toBeInTheDocument();
  });

  test("the hamburger opens the drawer; its own close button closes it again", () => {
    setViewport({ desktop: false });
    renderLayout();

    fireEvent.click(menuButton());

    expect(sidebarElement()).toHaveClass("translate-x-0");
    expect(sidebarElement()).not.toHaveAttribute("inert");
    expect(menuButton()).toHaveAttribute("aria-expanded", "true");
    expect(menuButton()).toHaveAttribute("aria-label", "Close menu");
    expect(document.querySelector("div.fixed.inset-0")).toBeInTheDocument();

    fireEvent.click(within(sidebarElement()).getByRole("button", { name: "Close menu" }));

    expect(sidebarElement()).toHaveClass("-translate-x-full");
    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
    expect(document.querySelector("div.fixed.inset-0")).not.toBeInTheDocument();
  });

  test("clicking the scrim closes the overlay drawer", () => {
    setViewport({ desktop: false });
    renderLayout();
    fireEvent.click(menuButton());

    const scrim = document.querySelector("div.fixed.inset-0");
    expect(scrim).toBeInTheDocument();

    fireEvent.click(scrim);

    expect(sidebarElement()).toHaveClass("-translate-x-full");
    expect(sidebarElement()).toHaveAttribute("inert");
    expect(document.querySelector("div.fixed.inset-0")).not.toBeInTheDocument();
  });

  test("clicking a navigation link navigates and closes the drawer", () => {
    setViewport({ desktop: false });
    renderLayout();
    fireEvent.click(menuButton());

    fireEvent.click(screen.getByText("Courses"));

    expect(screen.getByText("at:/courses")).toBeInTheDocument();
    expect(sidebarElement()).toHaveClass("-translate-x-full");
    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
  });

  test("logout closes the drawer, signs out and returns home", () => {
    setViewport({ desktop: false });
    renderLayout();
    fireEvent.click(menuButton());

    fireEvent.click(screen.getByText("Logout"));

    expect(authState.signOut).toHaveBeenCalled();
    expect(screen.getByText("at:/")).toBeInTheDocument();
    expect(sidebarElement()).toHaveClass("-translate-x-full");
  });
});

describe("sidebar navigation icons per role", () => {
  beforeEach(() => {
    authState.signOut.mockClear();
  });

  afterEach(() => {
    delete window.matchMedia;
    document.documentElement.className = "";
  });

  test.each(["organiser", "lecturer", "tutor", "student", "admin"])(
    "role %s sees exactly its navConfig links, each with the configured icon",
    (role) => {
      authState.role = role;
      setViewport({ desktop: true });
      renderLayout();

      const expected = NAV_LINKS.filter((link) => link.roles.includes(role));
      // "Applications" exists for both students/tutors and organisers — a role
      // that sees either variant should not fail the other's absence check.
      const expectedLabels = new Set(expected.map((link) => link.label));
      const hidden = NAV_LINKS.filter((link) => !expectedLabels.has(link.label));

      for (const link of expected) {
        const anchor = screen.getByText(link.label).closest("a");
        expect(anchor).toHaveAttribute("href", link.to);
        // Alignment contract: a row flex with a non-shrinking icon before the label.
        expect(anchor).toHaveClass("flex", "items-center");
        const icon = anchor.querySelector(".material-symbols-outlined");
        expect(icon).toHaveTextContent(link.icon);
        expect(icon).toHaveClass("shrink-0");
      }

      for (const link of hidden) {
        expect(screen.queryByText(link.label)).not.toBeInTheDocument();
      }

      // Account links render for every role with their own icons. (The Logout
      // button's accessible name mixes in the icon ligature text, so locate it
      // from its label the same way as the anchor items.)
      for (const link of FOOTER_LINKS) {
        const item = screen.getByText(link.label).closest(link.label === "Logout" ? "button" : "a");
        expect(item.querySelector(".material-symbols-outlined")).toHaveTextContent(link.icon);
      }
    },
  );

  test("an unloaded profile (null role) renders no role links but keeps the account group", () => {
    authState.role = null;
    setViewport({ desktop: true });
    renderLayout();

    for (const link of NAV_LINKS) {
      expect(screen.queryByText(link.label)).not.toBeInTheDocument();
    }
    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Logout")).toBeInTheDocument();
  });

  test("a role without dashboard links omits the Main Menu heading entirely", () => {
    authState.role = "student";
    setViewport({ desktop: true });
    renderLayout();

    expect(screen.queryByText("Main Menu")).not.toBeInTheDocument();
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("Account")).toBeInTheDocument();
  });

  test("the dead Resolve Conflicts shortcut is gone for every role", () => {
    authState.role = "tutor";
    setViewport({ desktop: true });
    const { unmount } = renderLayout();
    expect(screen.queryByText("Resolve Conflicts")).not.toBeInTheDocument();
    unmount();

    authState.role = "lecturer";
    setViewport({ desktop: true });
    renderLayout();
    expect(screen.queryByText("Resolve Conflicts")).not.toBeInTheDocument();
    // The user card is the only thing left in the sidebar footer.
    expect(screen.getByText("Alex Organiser")).toBeInTheDocument();
  });
});
