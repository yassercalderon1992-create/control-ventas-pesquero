
import type { UserProfile } from "../types/user";

export type AppPermission =
  | "dashboard:view"
  | "inventory:view"
  | "inventory:manage"
  | "movements:view"
  | "movements:register"
  | "purchases:view"
  | "purchases:create"
  | "purchases:cancel"
  | "sales:view"
  | "sales:create"
  | "sales:cancel"
  | "cash:view"
  | "cash:register"
  | "expenses:view"
  | "expenses:create"
  | "expenses:cancel"
  | "reports:view"
  | "users:manage"
  | "settings:manage";

/**
 * Matriz de permisos por rol.
 *
 * Estos permisos describen qué operaciones puede realizar
 * cada tipo de usuario. La autorización de la asociación
 * debe comprobarse por separado.
 */
export const ROLE_PERMISSIONS: Record<
  UserProfile["role"],
  readonly AppPermission[]
> = {
  Administrador: [
    "dashboard:view",
    "inventory:view",
    "inventory:manage",
    "movements:view",
    "movements:register",
    "purchases:view",
    "purchases:create",
    "purchases:cancel",
    "sales:view",
    "sales:create",
    "sales:cancel",
    "cash:view",
    "cash:register",
    "expenses:view",
    "expenses:create",
    "expenses:cancel",
    "reports:view",
    "users:manage",
    "settings:manage",
  ],

  Vendedor: [
    "dashboard:view",
    "inventory:view",
    "movements:view",
    "purchases:view",
    "purchases:create",
    "sales:view",
    "sales:create",
    "cash:view",
    "reports:view",
  ],

  Consulta: [
    "dashboard:view",
    "inventory:view",
    "movements:view",
    "purchases:view",
    "sales:view",
    "cash:view",
    "expenses:view",
    "reports:view",
  ],
};

/**
 * Comprueba si un rol tiene un permiso específico.
 */
export function hasPermission(
  role: UserProfile["role"] | null | undefined,
  permission: AppPermission
): boolean {
  if (!role) {
    return false;
  }

  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Devuelve todos los permisos disponibles para un rol.
 */
export function getRolePermissions(
  role: UserProfile["role"] | null | undefined
): readonly AppPermission[] {
  if (!role) {
    return [];
  }

  return ROLE_PERMISSIONS[role];
}

/**
 * Comprueba si el usuario puede gestionar cuentas.
 */
export function canManageUsers(
  role: UserProfile["role"] | null | undefined
): boolean {
  return hasPermission(role, "users:manage");
}
