import { Outlet } from "react-router-dom";
import AuthProvider from "./features/context/AuthProvider";
import ThemeProvider from "./features/context/ThemeProvider";

const RootLayout = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <main>
          <Outlet />
        </main>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default RootLayout;