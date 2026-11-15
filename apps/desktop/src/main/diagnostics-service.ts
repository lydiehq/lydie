import { z } from "zod";

import { diagnosticsService } from "../shared/diagnostics-service.ts";
import type { DiagnosticsRow } from "../shared/diagnostics-service.ts";
import type { ServiceRegistry } from "./services.ts";

export function registerDiagnosticsService(registry: ServiceRegistry) {
  registry.register(diagnosticsService, {
    requests: {
      echo: {
        input: z.object({ value: z.string().max(1_000_000) }).strict(),
        handle: ({ value }) => ({ value, receivedAt: Date.now() }),
      },
      rows: {
        input: z.object({ count: z.number().int().min(0).max(100_000) }).strict(),
        handle: ({ count }) => {
          const rows: DiagnosticsRow[] = [];
          for (let i = 0; i < count; i++) {
            rows.push({
              id: `01JD${i.toString(36).padStart(22, "0")}`,
              title: `Document ${i}`,
              path: `notes/folder-${i % 50}/document-${i}.md`,
              updatedAt: 1_700_000_000_000 + i,
            });
          }
          return rows;
        },
      },
    },
    streams: {
      ticks: {
        params: z.object({ intervalMs: z.number().int().min(10).max(60_000) }).strict(),
        subscribe: ({ intervalMs }, emit) => {
          let n = 0;
          const timer = setInterval(() => emit({ n: n++, sentAt: Date.now() }), intervalMs);
          return () => clearInterval(timer);
        },
      },
    },
  });
}
