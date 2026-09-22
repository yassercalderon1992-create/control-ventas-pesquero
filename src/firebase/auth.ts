import {
    getAuth,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
  } from "firebase/auth";
  
  import { app } from "./config";
  
  export const auth = getAuth(app);
  
  export function login(email: string, password: string) {
    return signInWithEmailAndPassword(auth, email, password);
  }
  
  export function logout() {
    return signOut(auth);
  }
  
  export { onAuthStateChanged };