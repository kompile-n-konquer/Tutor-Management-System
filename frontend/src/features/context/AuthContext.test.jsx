import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';

const { mockAuth } = vi.hoisted(() => ({ mockAuth: { currentUser: null } }));

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
  FirebaseError: class FakeFirebaseError extends Error {},
}));
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => mockAuth),
  onAuthStateChanged: vi.fn(),
  signOut: vi.fn(),
}));

import AuthProvider, { useAuth } from './AuthContext.jsx';

// Renders the context values so tests can assert on them and trigger signOut.
function AuthProbe() {
  const { currentUser, loading, signOut } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{currentUser ? currentUser.uid : 'none'}</span>
      <button onClick={() => signOut()}>sign out</button>
    </div>
  );
}

describe('AuthContext — Firebase-backed auth state provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('starts in the loading state until Firebase reports the first user', () => {
    // The listener never fires back — the provider must stay in loading.
    onAuthStateChanged.mockReturnValue(vi.fn());

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    expect(onAuthStateChanged).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('loading').textContent).toBe('true');
    expect(screen.getByTestId('user').textContent).toBe('none');
  });

  test('exposes the signed-in user once Firebase reports it', () => {
    onAuthStateChanged.mockImplementation((_auth, callback) => {
      callback({ uid: 'user-123' });
      return vi.fn();
    });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    expect(screen.getByTestId('loading').textContent).toBe('false');
    expect(screen.getByTestId('user').textContent).toBe('user-123');
  });

  test('unsubscribes from the Firebase listener on unmount', () => {
    const unsubscribe = vi.fn();
    onAuthStateChanged.mockReturnValue(unsubscribe);

    const { unmount } = render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );
    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  test('signOut delegates to Firebase and clears the current user', async () => {
    onAuthStateChanged.mockImplementation((_auth, callback) => {
      callback({ uid: 'user-123' });
      return vi.fn();
    });
    firebaseSignOut.mockResolvedValue(undefined);

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );
    expect(screen.getByTestId('user').textContent).toBe('user-123');

    await act(async () => {
      fireEvent.click(screen.getByText('sign out'));
    });

    expect(firebaseSignOut).toHaveBeenCalledWith(mockAuth);
    expect(screen.getByTestId('user').textContent).toBe('none');
  });

  test('useAuth throws when rendered outside the provider', () => {
    const Orphan = () => {
      useAuth();
      return null;
    };

    expect(() => render(<Orphan />)).toThrow(
      'The useAuth must be used within an AuthProvider and not directly',
    );
  });
});
