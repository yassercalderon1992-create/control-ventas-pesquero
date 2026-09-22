export interface UserProfile {
    email: string;
  
    role: "Administrador" | "Vendedor" | "Consulta";
  
    associationId: string;
    associationName: string;
  
    active: boolean;
  
    displayName?: string;
    phone?: string;
    photoURL?: string;
  }