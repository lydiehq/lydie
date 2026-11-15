// Ids are UUIDs in their canonical lowercase spelling. New ones are version 7: the time comes
// first, so they sort in the order they were minted (the operation log relies on it).
//
// Until November 2026 ids were ULIDs: the same 128 bits in 26 Crockford base32 characters. Every
// stored id was rewritten as a UUID (`uuidFromUlid`), which keeps the order. Text people wrote
// may still spell an id the old way (a `[[link]]` by id, an `attachment:` reference in a note):
// `normalizeId` reads both.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ULID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// For patterns that find ids inside text.
export const UUID_SOURCE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export const ULID_SOURCE = "[0-7][0-9A-HJKMNP-TV-Z]{25}";

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function isUlid(value: unknown): value is string {
  return typeof value === "string" && ULID.test(value);
}

export function uuidFromBits(bits: bigint): string {
  const hex = (bits & ((1n << 128n) - 1n)).toString(16).padStart(32, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function uuidFromBytes(bytes: Uint8Array): string {
  let bits = 0n;
  for (let i = 0; i < 16; i++) bits = (bits << 8n) | BigInt(bytes[i] ?? 0);
  return uuidFromBits(bits);
}

export function uuidFromUlid(ulid: string): string {
  let bits = 0n;
  for (const char of ulid) bits = (bits << 5n) | BigInt(CROCKFORD.indexOf(char));
  return uuidFromBits(bits);
}

export function ulidFromUuid(uuid: string): string {
  let bits = BigInt(`0x${uuid.replaceAll("-", "")}`);
  let out = "";
  for (let i = 0; i < 26; i++, bits >>= 5n) out = CROCKFORD[Number(bits & 31n)]! + out;
  return out;
}

// The id a piece of text names, in either spelling; null when it is not an id.
export function normalizeId(value: string): string | null {
  if (UUID.test(value)) return value;
  const lower = value.toLowerCase();
  if (UUID.test(lower)) return lower;
  return ULID.test(value) ? uuidFromUlid(value) : null;
}

const ULID_TOKEN = new RegExp(`(?<![0-9A-Za-z])${ULID_SOURCE}(?![0-9A-Za-z])`, "g");

// Every ULID in a piece of stored text (a column, a JSON or YAML file with ids in it) as its
// UUID. For data written before the change, not for text people wrote.
export function uuidsForUlids(text: string): string {
  return text.replace(ULID_TOKEN, uuidFromUlid);
}

// What ids derived by hashing (a folder note's id from its path, the Getting started pages) feed
// the hash with: a workspace id in the spelling it had when such ids were first derived, so they
// came through the change to UUIDs unchanged.
export function hashSpelling(id: string): string {
  return UUID.test(id) ? ulidFromUuid(id) : id;
}

// The smallest id minted at `ms`: version 7 ids below it are older.
export function uuidFloor(ms: number): string {
  return uuidFromBits(BigInt(Math.max(0, Math.floor(ms))) << 80n);
}
