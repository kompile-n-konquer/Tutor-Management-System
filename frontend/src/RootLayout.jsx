import { Outlet } from "react-router-dom";
import AuthProvider from "./features/context/AuthProvider";
import ForbiddenGate from "./components/auth/ForbiddenGate.jsx";

const RootLayout = () => {
  return (
    <AuthProvider>
      <ForbiddenGate>
        <main>
          <Outlet />
        </main>
      </ForbiddenGate>
    </AuthProvider>
    
  );
};

export default RootLayout;