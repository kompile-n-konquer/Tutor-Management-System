import { Outlet } from "react-router-dom";
import AuthProvider from "./features/context/AuthContext";

const RootLayout = () => {
  return (
    <AuthProvider>
      <main>
        <Outlet />
      </main>
    </AuthProvider>
    
  );
};

export default RootLayout;