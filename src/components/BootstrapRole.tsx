import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "convex/react";
import { useEffect, useRef } from "react";

/**
 * Ensures the panel always has an owner: the first non-anonymous account to
 * sign up is promoted to owner. Idempotent, runs once per session.
 */
export function BootstrapRole() {
  const { isAuthenticated } = useAuth();
  const bootstrap = useMutation(api.nameserver.bootstrapOwner);
  const ran = useRef(false);

  useEffect(() => {
    if (isAuthenticated && !ran.current) {
      ran.current = true;
      void bootstrap().catch((err) => {
        console.warn("bootstrapOwner failed:", err);
      });
    }
  }, [isAuthenticated, bootstrap]);

  return null;
}
