import { describe, test, expect, vi } from 'vitest';

// Router.jsx pulls in every page. Keep the Firebase side effects of
// firebase.js (initializeApp/getAuth) and googleProvider.js out of the test —
// they run at import time and would fail without real credentials.
vi.mock('./firebase/firebase', () => ({ auth: {} }));
vi.mock('./firebase/googleProvider', () => ({ default: {} }));

import router from './Router.jsx';
import RootLayout from './RootLayout.jsx';
import ErrorPage from './components/error-page/ErrorPage.jsx';
import Dashboard from './features/dashboard/Dashboard.jsx';
import { Navigate } from 'react-router-dom';

describe('Router — application route table', () => {
  test('mounts the root layout with the error boundary', () => {
    const root = router.routes[0];

    expect(root.path).toBe('/');
    expect(root.element.type).toBe(RootLayout);
    expect(root.errorElement.type).toBe(ErrorPage);
  });

  test('wires every page as a child of the root layout', () => {
    const children = router.routes[0].children;

    expect(children.map((route) => route.path ?? 'index')).toEqual([
      'index',
      'signup',
      'login',
      'forgot-password',
      'confirmation-message',
      'dashboard',
      'organiser',
      'organiser-analytics',
      'tutor-dashboard',
      'volunteer',
      'profile',
      'profile/edit',
      'timetable/edit',
      'applications',
      'timesheets',
      'settings',
      'courses',
      'events',
      'lecturer-view',
      'admin-view',
      'onboarding',
      'onboarding/tutor-application',
      'onboarding/lecturer-application',
      'application-review',
      'swaps',
      'swap-review',
      '*', // catch-all renders the error page
    ]);
    // Every leaf route must render an element; container routes (courses,
    // events, applications, timesheets) render their children through <Outlet>.
    children.forEach((route) => {
      if (route.children) {
        expect(route.children.length).toBeGreaterThan(0);
        route.children.forEach((child) => expect(child.element).toBeDefined());
      } else {
        expect(route.element).toBeDefined();
      }
    });
    // The landing page is the index route.
    expect(children[0].index).toBe(true);
  });

  test('the unified dashboard replaces the old role dashboards', () => {
    const children = router.routes[0].children;
    const byPath = Object.fromEntries(children.map((route) => [route.path, route]));

    // /dashboard mounts the unified page for every staff role.
    expect(byPath.dashboard.element.type).toBe(Dashboard);

    // The legacy role-dashboard routes are permanent redirects — in-app
    // navigate() calls and old bookmarks land on the unified page.
    for (const legacy of ['tutor-dashboard', 'lecturer-view', 'admin-view']) {
      const element = byPath[legacy].element;
      expect(element.type).toBe(Navigate);
      expect(element.props).toMatchObject({ to: '/dashboard', replace: true });
    }
  });
});
