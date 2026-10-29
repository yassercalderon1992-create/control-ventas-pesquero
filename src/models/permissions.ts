
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

export type AppRole = "Administrador" | "Vendedor" | "Consulta";

export const ROLE_PERMISSIONS: Record<AppRole, AppPermission[]> = {
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
    "inventory:manage",
    "movements:view",
    "movements:register",
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
    "reports:view",
  ],
};

export function hasPermission(
  role: AppRole,
  permission: AppPermission
): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
