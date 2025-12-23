import { useZero as _useZero, ZeroProvider } from "@rocicorp/zero/react";
import { mutators } from "@lydie/zero/mutators";
import { schema } from "@lydie/zero/schema";
import { Zero } from "@rocicorp/zero";
import { useCallback } from "react";
import { useParams, useRouter } from "@tanstack/react-router";
import type { Session } from "better-auth";
import { queries } from "@lydie/zero/queries";

type Props = {
  children: React.ReactNode;
  session: Session;
};

export function ZeroInit({ children, session }: Props) {
  const router = useRouter();
  const params = useParams({ strict: false });

  const init = useCallback(
    (zero: Zero) => {
      router.update({
        context: {
          ...router.options.context,
          zero,
        },
      });

      router.invalidate();
      if (params.organizationId) {
        preload(zero, params.organizationId);
      }
    },
    [router]
  );

  const context = session;
  const cacheURL = import.meta.env.VITE_ZERO_URL;
  const userID = session?.userId ?? "anon";

  return (
    <ZeroProvider {...{ schema, userID, context, cacheURL, mutators, init }}>
      {children}
    </ZeroProvider>
  );
}

function preload(zero: Zero, organizationId: string) {
  zero.preload(queries.organizations.documentsAndFolders({ organizationId }));
}
