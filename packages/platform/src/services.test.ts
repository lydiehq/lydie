import { describe, expect, it } from "bun:test";

import { PlatformError } from "./errors.ts";
import { createLocalServiceChannel, defineService, serviceClient } from "./services.ts";

type Counter = {
  requests: { add: { input: { by: number }; output: number } };
  streams: { values: { params: { every: number }; event: number } };
};

const counterService = defineService<Counter>("counter");

describe("services", () => {
  it("routes typed requests and streams through a channel", async () => {
    const channel = createLocalServiceChannel();
    let value = 0;
    const emitters = new Set<(event: number) => void>();
    channel.register(counterService, {
      requests: {
        add: ({ by }) => {
          if (by < 0) throw new PlatformError("invalid-argument", "negative");
          value += by;
          for (const emit of emitters) emit(value);
          return value;
        },
      },
      streams: {
        values: (_params, emit) => {
          emitters.add(emit);
          return () => emitters.delete(emit);
        },
      },
    });

    const client = serviceClient(channel, counterService);
    const seen: number[] = [];
    const off = client.subscribe("values", { every: 1 }, (event) => seen.push(event));
    expect(await client.request("add", { by: 2 })).toBe(2);
    off();
    await client.request("add", { by: 3 });
    expect(seen).toEqual([2]);

    await expect(client.request("add", { by: -1 })).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("reports unknown streams to onError", () => {
    const client = serviceClient(createLocalServiceChannel(), counterService);
    const errors: Error[] = [];
    client.subscribe(
      "values",
      { every: 1 },
      () => {},
      (error) => errors.push(error),
    );
    expect(errors).toHaveLength(1);
  });

  it("rejects badly formed service names", () => {
    expect(() => defineService("Bad Name")).toThrow(/kebab-case/);
  });
});
