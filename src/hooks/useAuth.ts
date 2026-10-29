
import { useAuthContext } from "../contexts/AuthContext";

export function useAuth() {
  const context = useAuthContext();

  return {
    ...context,

    // Compatibilidad con AppRoutes.tsx,
    // que utiliza la propiedad "authenticated".
    authenticated: context.isAuthenticated,
  };
}
