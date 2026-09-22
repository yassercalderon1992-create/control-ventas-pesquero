import {
    signInWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail,
  } from "firebase/auth";
  
  import { doc, getDoc } from "firebase/firestore";
  
  import { auth } from "../firebase/auth";
  import { db } from "../firebase/firestore";
  
  export interface UserProfile {
    email: string;
    role: "Administrador" | "Vendedor" | "Consulta";
    associationId: string;
    associationName: string;
    active: boolean;
  }
  
  class AuthService {
    async login(email: string, password: string): Promise<UserProfile> {
      const credential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
  
      const userEmail = credential.user.email;
  
      if (!userEmail) {
        throw new Error("El usuario no tiene correo electrónico.");
      }
  
      const userRef = doc(db, "users", userEmail);
      const userSnap = await getDoc(userRef);
  
      if (!userSnap.exists()) {
        throw new Error("El usuario no existe en Firestore.");
      }
  
      return userSnap.data() as UserProfile;
    }
  
    async logout() {
      await signOut(auth);
    }
  
    async resetPassword(email: string) {
      await sendPasswordResetEmail(auth, email);
    }
  }
  
  export const authService = new AuthService();