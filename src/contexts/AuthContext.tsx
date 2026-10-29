
import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import type { ReactNode } from "react";

import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth } from "../firebase/auth";
import { db } from "../firebase/firestore";
import { authService } from "../services/authService";

import type { UserProfile } from "../types/user";

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType>(
  {} as AuthContextType
);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({
  children,
}: AuthProviderProps) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        if (!active) return;

        setLoading(true);

        try {
          if (!firebaseUser?.email) {
            if (active) {
              setUser(null);
            }

            return;
          }

          const email = firebaseUser.email
            .trim()
            .toLowerCase();

          const userRef = doc(db, "users", email);
          const userSnapshot = await getDoc(userRef);

          if (!active) return;

          if (!userSnapshot.exists()) {
            setUser(null);
            return;
          }

          const profile = userSnapshot.data();

          if (profile.active === false) {
            setUser(null);
            return;
          }

          const validRoles = [
            "Administrador",
            "Vendedor",
            "Consulta",
          ];

          if (!validRoles.includes(profile.role)) {
            setUser(null);
            return;
          }

          if (
            typeof profile.associationId !== "string" ||
            !profile.associationId.trim() ||
            typeof profile.associationName !== "string"
          ) {
            setUser(null);
            return;
          }

          setUser({
            ...profile,
            email,
            role: profile.role,
            associationId: profile.associationId,
            associationName: profile.associationName,
            active: profile.active !== false,
          } as UserProfile);
        } catch (error) {
          console.error(
            "Error al recuperar el perfil de autenticación:",
            error
          );

          if (active) {
            setUser(null);
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function login(
    email: string,
    password: string
  ): Promise<void> {
    const profile = await authService.login(
      email,
      password
    );

    setUser(profile as UserProfile);
  }

  async function logout(): Promise<void> {
    await authService.logout();
    setUser(null);
  }

  const contextValue: AuthContextType = {
    user,
    loading,
    login,
    logout,
    isAuthenticated: user !== null,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook original del contexto.
 */
export function useAuthContext(): AuthContextType {
  return useContext(AuthContext);
}

/**
 * Alias compatible con los componentes que utilizan useAuth().
 */
export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}
