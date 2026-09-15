import { Outlet } from "react-router-dom";
import AuthProvider from "./features/context/AuthProvider";

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