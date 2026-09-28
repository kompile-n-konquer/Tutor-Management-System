import { Outlet } from "react-router-dom";
import AuthProvider from "./features/context/AuthProvider";
import ThemeProvider from "./features/context/ThemeProvider";
import ForbiddenGate from "./components/auth/ForbiddenGate.jsx";

const RootLayout = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ForbiddenGate>
        <main>
          <Outlet />
        </main>
      </ForbiddenGate>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default RootLayout;