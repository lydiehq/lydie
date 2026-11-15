import { defineService } from "@lydie/platform";

export type DiagnosticsRow = { id: string; title: string; path: string; updatedAt: number };

// A stand-in service the diagnostic page and tests use to exercise and time the service channel.
// `rows` returns a result shaped like a tree query so the cost of moving query results across IPC
// can be measured before choosing where SQLite runs.
export type DiagnosticsContract = {
  requests: {
    echo: { input: { value: string }; output: { value: string; receivedAt: number } };
    rows: { input: { count: number }; output: DiagnosticsRow[] };
  };
  streams: {
    ticks: { params: { intervalMs: number }; event: { n: number; sentAt: number } };
  };
};

export const diagnosticsService = defineService<DiagnosticsContract>("diagnostics");
