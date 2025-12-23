import { useZero as _useZero } from "@rocicorp/zero/react";

/**
 * Hook to check if the user is in trial mode (unauthenticated, local-only)
 * @returns true if user is in trial mode, false if authenticated
 */
export function useIsTrial(): boolean {
  const zero = _useZero();
  return zero.context?.isTrial === true;
}

