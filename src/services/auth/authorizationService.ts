
import { doc, getDoc } from "firebase/firestore";

import { auth } from "../../firebase/auth";
import { db } from "../../firebase/firestore";

import type { UserProfile } from "../../types/user";
import type { AppPermission } from "../../models/permissions";

import { hasPermission } from "../../models/permissions";

export class AuthorizationService {
  /**
   * Comprueba:
   * 1. Que exista una sesión autenticada.
   * 2. Que el perfil del usuario exista y esté activo.
   * 3. Que el usuario tenga el permiso solicitado.
   * 4. Que pueda operar en la asociación indicada.
   *
   * Esta validación complementa las reglas de Firestore;
   * no las sustituye.
   */
  async authorizeAssociationWrite(
    associationId: string,
    permission: AppPermission
  ): Promise<UserProfile> {
    const firebaseUser = auth.currentUser;

    if (!firebaseUser?.email) {
      throw new Error(
        "Debes iniciar sesión para realizar esta operación."
      );
    }

    const email = firebaseUser.email.trim().toLowerCase();
    const targetAssociationId = associationId.trim();

    if (!targetAssociationId) {
      throw new Error("La asociación es obligatoria.");
    }

    if (!permission) {
      throw new Error(
        "Debes especificar el permiso requerido para esta operación."
      );
    }

    // Consultar el perfil vigente en Firestore.
    const userRef = doc(db, "users", email);
    const userSnapshot = await getDoc(userRef);

    if (!userSnapshot.exists()) {
      throw new Error(
        "No existe un perfil de usuario asociado a esta cuenta."
      );
    }

    const profile = userSnapshot.data() as UserProfile;

    if (
      profile.email?.trim().toLowerCase() !== email
    ) {
      throw new Error(
        "El correo del perfil no coincide con la cuenta autenticada."
      );
    }

    if (profile.active !== true) {
      throw new Error(
        "Tu cuenta está inactiva. Contacta al administrador."
      );
    }

    // Comprobar el permiso definido para su rol.
    if (!hasPermission(profile.role, permission)) {
      throw new Error(
        `Tu rol no tiene permiso para realizar esta operación: ${permission}.`
      );
    }

    // Solo el administrador global puede operar en
    // asociaciones distintas de la asignada a su perfil.
    const isGlobalAdmin =
      profile.role === "Administrador" &&
      profile.associationId?.trim().toLowerCase() === "todas";

    const belongsToAssociation =
      profile.associationId?.trim() === targetAssociationId;

    if (!isGlobalAdmin && !belongsToAssociation) {
      throw new Error(
        "No tienes autorización para operar en esta asociación."
      );
    }

    return profile;
  }
}

export const authorizationService =
  new AuthorizationService();
