import { uuidFromBytes } from "@lydie/contract";

import type { Ids } from "./ports.ts";

// Version 7 UUIDs: 48 bits of time, then randomness. Within one millisecond the random part
// increments, so ids minted in a burst still sort in creation order.
export function createUuidGenerator(now: () => number = Date.now): Ids {
  let lastTime = -1;
  let random: Uint8Array = new Uint8Array(10);
  return {
    uuid() {
      const time = now();
      if (time === lastTime) {
        increment(random);
      } else {
        lastTime = time;
        random = fresh();
      }
      const bytes = new Uint8Array(16);
      let rest = time;
      for (let i = 5; i >= 0; i--) {
        bytes[i] = rest % 256;
        rest = Math.floor(rest / 256);
      }
      bytes.set(random, 6);
      // The version (7) and the variant (10) take the top bits of bytes 6 and 8.
      bytes[6] = 0x70 | (random[0]! & 0x0f);
      bytes[8] = 0x80 | (random[2]! & 0x3f);
      return uuidFromBytes(bytes);
    },
  };
}

const defaultGenerator = createUuidGenerator();

export function uuid(): string {
  return defaultGenerator.uuid();
}

// The bits of each random byte that end up in the id.
const MASK = [0x0f, 0xff, 0x3f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];

function fresh(): Uint8Array {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  // Room to count upwards within the millisecond.
  bytes[0] = bytes[0]! & 0x07;
  for (let i = 0; i < 10; i++) bytes[i] = bytes[i]! & MASK[i]!;
  return bytes;
}

function increment(bytes: Uint8Array): void {
  for (let i = 9; i >= 0; i--) {
    if (bytes[i]! < MASK[i]!) {
      bytes[i] = bytes[i]! + 1;
      return;
    }
    bytes[i] = 0;
  }
  // 2^74 ids in one millisecond: start over with fresh randomness rather than overflow.
  bytes.set(fresh());
}
