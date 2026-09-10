import { describe, test, expect, vi } from 'vitest';

// Router.jsx pulls in every page. Keep the Firebase side effects of
// firebase.js (initializeApp/getAuth) and googleProvider.js out of the test —
// they run at import time and would fail without real credentials.
vi.mock('./firebase/firebase', () => ({ auth: {} }));
vi.mock('./firebase/googleProvider', () => ({ default: {} }));

import router from './Router.jsx';
import RootLayout from './RootLayout.jsx';
import ErrorPage from './components/error-page/ErrorPage.jsx';

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
      'organiser',
      'organiser-analytics',
      'tutor-dashboard',
      'volunteer',
      'profile',
      'timetable/edit',
      'timesheets',
      'settings',
    ]);
    // Every route must render an element.
    children.forEach((route) => expect(route.element).toBeDefined());
    // The landing page is the index route.
    expect(children[0].index).toBe(true);
  });
});
