import { Navigate } from "react-router-dom";
import { auth } from "../firebase/auth";

interface Props {
  children: JSX.Element;
}

export default function ProtectedRoute({
  children,
}: Props) {

  if (!auth.currentUser) {
    return <Navigate to="/" replace />;
  }

  return children;
}