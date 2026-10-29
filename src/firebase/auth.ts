import { getAuth, signOut } from "firebase/auth";
import { app } from "./config";

export const auth = getAuth(app);

export const logout = () => signOut(auth);