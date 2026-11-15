import { describe, expect, it } from "bun:test";

import {
  hashSpelling,
  isUlid,
  isUuid,
  normalizeId,
  ulidFromUuid,
  uuidFloor,
  uuidFromBytes,
  uuidFromUlid,
} from "./ids.ts";

describe("ids", () => {
  it("recognises the canonical spelling only", () => {
    expect(isUuid("0193a5e2-7c3b-7def-8a1b-2c3d4e5f6a7b")).toBe(true);
    expect(isUuid("0193A5E2-7C3B-7DEF-8A1B-2C3D4E5F6A7B")).toBe(false);
    expect(isUuid("0193a5e27c3b7def8a1b2c3d4e5f6a7b")).toBe(false);
    expect(isUuid("01M7BKKHMJ4BTYPD7RDDJ7WVMX")).toBe(false);
    expect(isUlid("01M7BKKHMJ4BTYPD7RDDJ7WVMX")).toBe(true);
    expect(isUlid("81M7BKKHMJ4BTYPD7RDDJ7WVMX")).toBe(false);
  });

  it("rewrites a ULID as the same 128 bits, and back", () => {
    expect(uuidFromUlid("00000000000000000000000000")).toBe("00000000-0000-0000-0000-000000000000");
    expect(uuidFromUlid("7ZZZZZZZZZZZZZZZZZZZZZZZZZ")).toBe("ffffffff-ffff-ffff-ffff-ffffffffffff");
    const ulid = "01M7BKKHMJ4BTYPD7RDDJ7WVMX";
    const uuid = uuidFromUlid(ulid);
    expect(isUuid(uuid)).toBe(true);
    expect(ulidFromUuid(uuid)).toBe(ulid);
    expect(hashSpelling(uuid)).toBe(ulid);
    expect(hashSpelling("bench")).toBe("bench");
  });

  it("keeps the order ULIDs had", () => {
    const ulids = [
      "01JCZ6Y8M4Q1W2E3R4T5Y6V001",
      "01JCZ6Y8M4Q1W2E3R4T5Y6V00Z",
      "01M7BKKHMJ4BTYPD7RDDJ7WVMX",
    ];
    const uuids = ulids.map(uuidFromUlid);
    expect([...uuids].sort()).toEqual(uuids);
  });

  it("reads an id in either spelling", () => {
    const uuid = uuidFromUlid("01M7BKKHMJ4BTYPD7RDDJ7WVMX");
    expect(normalizeId(uuid)).toBe(uuid);
    expect(normalizeId(uuid.toUpperCase())).toBe(uuid);
    expect(normalizeId("01M7BKKHMJ4BTYPD7RDDJ7WVMX")).toBe(uuid);
    expect(normalizeId("Meeting notes")).toBeNull();
  });

  it("bytes and floors", () => {
    expect(uuidFromBytes(new Uint8Array(16).fill(0xab))).toBe(
      "abababab-abab-abab-abab-abababababab",
    );
    expect(uuidFloor(0x0193a5e27c3b)).toBe("0193a5e2-7c3b-0000-0000-000000000000");
  });
});
