import { Outlet } from "react-router-dom";
import AuthProvider from "./features/context/AuthProvider";
import ThemeProvider from "./features/context/ThemeProvider";
import AuthOverlayProvider from "./features/auth/overlay/AuthOverlayProvider.jsx";
import AuthOverlay from "./features/auth/overlay/AuthOverlay.jsx";
import { useAuth } from "./features/context/AuthContext";

const AppShell = () => {
  const { loading } = useAuth();

  // Hold every route back until Firebase has restored the session. Pages then
  // mount with a signed-in user already in context, so their first API call
  // carries the ID token instead of going out anonymously and 401-ing.
  if (loading) {
    return (
      <main aria-busy="true" className="flex min-h-screen items-center justify-center">
        <p className="animate-pulse text-sm text-slate-500 dark:text-slate-400">
          Checking your session...
        </p>
      </main>
    );
  }

  return (
    <>
      <main>
        <Outlet />
      </main>
      {/* Global auth overlay — floats above whichever page is mounted */}
      <AuthOverlay />
    </>
  );
};

const RootLayout = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AuthOverlayProvider>
          <AppShell />
        </AuthOverlayProvider>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default RootLayout;