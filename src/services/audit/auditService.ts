
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";

import { auth } from "../../firebase/auth";
import { db } from "../../firebase/firestore";

import type { UserProfile } from "../../types/user";

export interface AuditLogInput {
  action: string;
  associationId?: string;
  entityType?: string;
  entityId?: string;
  createdBy?: string;
  details?: Record<string, unknown>;
}

class AuditService {
  /**
   * Registra una acción de auditoría.
   *
   * Acepta un string para conservar compatibilidad con
   * llamadas existentes o un objeto con detalles.
   *
   * Este servicio solo crea registros. No permite modificar
   * ni eliminar entradas de auditoría.
   *
   * La protección definitiva también depende de las reglas
   * de seguridad de Firestore.
   */
  async log(
    input: string | AuditLogInput
  ): Promise<string> {
    const entry: AuditLogInput =
      typeof input === "string"
        ? { action: input }
        : input;

    const action = entry.action?.trim();

    if (!action) {
      throw new Error(
        "La acción de auditoría es obligatoria."
      );
    }

    // 1. Exigir una sesión autenticada.
    const currentUser = auth.currentUser;

    if (!currentUser?.email) {
      throw new Error(
        "Debes iniciar sesión para registrar una auditoría."
      );
    }

    const email = currentUser.email.trim().toLowerCase();

    // 2. Consultar el perfil real del usuario.
    const userRef = doc(db, "users", email);
    const userSnapshot = await getDoc(userRef);

    if (!userSnapshot.exists()) {
      throw new Error(
        "No existe un perfil para el usuario autenticado."
      );
    }

    const profile = userSnapshot.data() as UserProfile;

    if (
      profile.email?.trim().toLowerCase() !== email
    ) {
      throw new Error(
        "El correo del perfil no coincide con la sesión autenticada."
      );
    }

    if (profile.active !== true) {
      throw new Error(
        "La cuenta está inactiva y no puede registrar auditorías."
      );
    }

    // 3. Determinar el alcance de asociación autorizado.
    const isGlobalAdmin =
      profile.role === "Administrador" &&
      profile.associationId?.trim().toLowerCase() === "todas";

    const requestedAssociationId =
      entry.associationId?.trim();

    let associationId: string | undefined;

    if (requestedAssociationId) {
      const belongsToAssociation =
        profile.associationId?.trim() ===
        requestedAssociationId;

      if (!isGlobalAdmin && !belongsToAssociation) {
        throw new Error(
          "No tienes autorización para registrar auditorías de esta asociación."
        );
      }

      associationId = requestedAssociationId;
    } else if (!isGlobalAdmin) {
      // Para usuarios de una sola asociación, el alcance
      // proviene del perfil y no del formulario.
      associationId = profile.associationId.trim();
    }

    // 4. Construir la auditoría con la identidad autenticada.
    // No aceptar entry.createdBy como identidad verificable.
    const auditData = {
      action,
      actorUid: currentUser.uid,
      actorEmail: email,
      createdBy: email,

      ...(associationId
        ? { associationId }
        : {}),

      ...(entry.entityType?.trim()
        ? { entityType: entry.entityType.trim() }
        : {}),

      ...(entry.entityId?.trim()
        ? { entityId: entry.entityId.trim() }
        : {}),

      ...(entry.details
        ? { details: entry.details }
        : {}),

      createdAt: serverTimestamp(),
    };

    // 5. Crear el documento. Este servicio no expone
    // métodos para sobrescribir o borrar registros.
    const documentRef = await addDoc(
      collection(db, "auditLogs"),
      auditData
    );

    return documentRef.id;
  }
}

export const auditService = new AuditService();

export { AuditService };
