import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth } from "../firebase/auth";
import { db } from "../firebase/firestore";
import { authService } from "../services/authService";
import { UserProfile } from "../types/user";

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

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        if (!firebaseUser?.email) {
          setUser(null);
          setLoading(false);
          return;
        }

        const ref = doc(db, "users", firebaseUser.email);

        const snap = await getDoc(ref);

        if (snap.exists()) {
          setUser(snap.data() as UserProfile);
        } else {
          setUser(null);
        }

        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  async function login(email: string, password: string) {
    const profile = await authService.login(email, password);
    setUser(profile);
  }

  async function logout() {
    await authService.logout();
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  return useContext(AuthContext);
}