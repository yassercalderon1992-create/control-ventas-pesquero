import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  enableIndexedDbPersistence,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBYAQpI079qJ39mBc682tsgsrKboth9ZT0",
  authDomain: "pesca-2026.firebaseapp.com",
  projectId: "pesca-2026",
  storageBucket: "pesca-2026.firebasestorage.app",
  messagingSenderId: "176064740076",
  appId: "1:176064740076:web:b8c53d8eb1d49484d903c9",
  measurementId: "G-RX5VZTGJ99",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

enableIndexedDbPersistence(db).catch((error) => {
  if (error.code === "failed-precondition") {
    console.warn("Persistencia offline no activada: hay varias pestañas abiertas.");
  } else if (error.code === "unimplemented") {
    console.warn("Este navegador no soporta persistencia offline de Firestore.");
  } else {
    console.warn("No se pudo activar persistencia offline:", error);
  }
});