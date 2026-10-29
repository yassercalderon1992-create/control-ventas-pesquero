
import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from "firebase/auth";

import { doc, getDoc } from "firebase/firestore";

import { auth } from "../../firebase/auth";
import { db } from "../../firebase/firestore";

export interface UserProfile {
  email: string;
  role: "Administrador" | "Vendedor" | "Consulta";
  associationId: string;
  associationName: string;
  active: boolean;
}

class AuthService {
  async login(
    email: string,
    password: string
  ): Promise<UserProfile> {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      throw new Error(
        "Debes introducir el correo y la contraseña."
      );
    }

    // 1. Autenticar con Firebase Authentication.
    const credential = await signInWithEmailAndPassword(
      auth,
      normalizedEmail,
      password
    );

    const userEmail = credential.user.email
      ?.trim()
      .toLowerCase();

    if (!userEmail) {
      await signOut(auth);

      throw new Error(
        "La cuenta autenticada no tiene un correo válido."
      );
    }

    // 2. Consultar el perfil existente en Firestore.
    const userRef = doc(db, "users", userEmail);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      await signOut(auth);

      throw new Error(
        "La cuenta se autenticó, pero no existe su perfil en Firestore."
      );
    }

    const data = userSnap.data();

    // 3. Validar el estado del usuario.
    if (data.active === false) {
      await signOut(auth);

      throw new Error(
        "Tu usuario está inactivo. Contacta con el administrador."
      );
    }

    // 4. Validar el rol.
    const validRoles = [
      "Administrador",
      "Vendedor",
      "Consulta",
    ];

    if (!validRoles.includes(data.role)) {
      await signOut(auth);

      throw new Error(
        "El perfil no tiene un rol válido configurado."
      );
    }

    // 5. Verificar los datos de asociación.
    if (
      typeof data.associationId !== "string" ||
      !data.associationId.trim()
    ) {
      await signOut(auth);

      throw new Error(
        "El perfil no tiene una asociación configurada."
      );
    }

    if (
      typeof data.associationName !== "string"
    ) {
      await signOut(auth);

      throw new Error(
        "El perfil no tiene un nombre de asociación válido."
      );
    }

    return {
      email: userEmail,
      role: data.role as UserProfile["role"],
      associationId: data.associationId,
      associationName: data.associationName,
      active: data.active !== false,
    };
  }

  async logout(): Promise<void> {
    await signOut(auth);
  }

  async resetPassword(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      throw new Error(
        "Debes introducir un correo electrónico."
      );
    }

    await sendPasswordResetEmail(
      auth,
      normalizedEmail
    );
  }
}

export const authService = new AuthService();

export { AuthService };
