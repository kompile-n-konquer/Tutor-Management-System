import { useContext } from "react";
import AuthContext from "../features/context/AuthContext.js";

export default function useAuth() {
  return useContext(AuthContext);
}
