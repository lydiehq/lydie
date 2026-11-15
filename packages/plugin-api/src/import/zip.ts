// Reads a zip's directory and inflates one entry at a time, on demand, from slices of the file:
// a workspace export can be hundreds of megabytes, and only the entry being read is in memory.
// Stored entries (Notion's zips inside its zip) are handed out as slices without being read.
import { inflateSync } from "fflate";

export type ZipEntry = {
  // Forward slashes, as stored; directories end in "/".
  path: string;
  size: number;
  modified: Date | null;
  // The entry's bytes as a Blob (a slice of the zip when it is stored uncompressed).
  blob: () => Promise<Blob>;
  read: () => Promise<Uint8Array>;
  text: () => Promise<string>;
};

const EOCD = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_EOCD = 0x06064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX_U32 = 0xffffffff;

export class ZipError extends Error {}

async function bytesOf(blob: Blob, from: number, to: number): Promise<DataView> {
  return new DataView(await blob.slice(from, to).arrayBuffer());
}

const u64 = (view: DataView, at: number) => Number(view.getBigUint64(at, true));

const decoder = new TextDecoder("utf-8");

function dosDate(date: number, time: number): Date | null {
  if (date === 0) return null;
  const year = 1980 + (date >> 9);
  if (year <= 1980) return null;
  return new Date(
    year,
    ((date >> 5) & 0xf) - 1,
    date & 0x1f,
    time >> 11,
    (time >> 5) & 0x3f,
    (time & 0x1f) * 2,
  );
}

// Where the central directory is and how many entries it has (zip64 aware).
async function directory(file: Blob): Promise<{ offset: number; size: number; count: number }> {
  const tail = Math.min(file.size, 22 + 0xffff);
  const view = await bytesOf(file, file.size - tail, file.size);
  let at = -1;
  for (let i = view.byteLength - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === EOCD) {
      at = i;
      break;
    }
  }
  if (at < 0) throw new ZipError("This is not a zip file, or it is incomplete.");
  let count = view.getUint16(at + 10, true);
  let size = view.getUint32(at + 12, true);
  let offset = view.getUint32(at + 16, true);
  if (count === 0xffff || size === MAX_U32 || offset === MAX_U32) {
    const locator = at - 20;
    if (locator < 0 || view.getUint32(locator, true) !== ZIP64_LOCATOR) {
      throw new ZipError("The zip's directory could not be read.");
    }
    const recordAt = u64(view, locator + 8);
    const record = await bytesOf(file, recordAt, recordAt + 56);
    if (record.getUint32(0, true) !== ZIP64_EOCD) {
      throw new ZipError("The zip's directory could not be read.");
    }
    count = u64(record, 32);
    size = u64(record, 40);
    offset = u64(record, 48);
  }
  return { offset, size, count };
}

export async function openZip(file: Blob): Promise<ZipEntry[]> {
  const dir = await directory(file);
  const view = await bytesOf(file, dir.offset, dir.offset + dir.size);
  const entries: ZipEntry[] = [];
  let at = 0;
  for (let n = 0; n < dir.count && at + 46 <= view.byteLength; n++) {
    if (view.getUint32(at, true) !== CENTRAL) break;
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const time = view.getUint16(at + 12, true);
    const date = view.getUint16(at + 14, true);
    let compressed = view.getUint32(at + 20, true);
    let size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    let local = view.getUint32(at + 42, true);
    const path = decoder.decode(new Uint8Array(view.buffer, view.byteOffset + at + 46, nameLength));
    // Zip64: the sizes and offset that did not fit are in extra field 0x0001, in this order.
    let extra = at + 46 + nameLength;
    const extraEnd = extra + extraLength;
    while (extra + 4 <= extraEnd) {
      const id = view.getUint16(extra, true);
      const length = view.getUint16(extra + 2, true);
      if (id === 1) {
        let field = extra + 4;
        if (size === MAX_U32) {
          size = u64(view, field);
          field += 8;
        }
        if (compressed === MAX_U32) {
          compressed = u64(view, field);
          field += 8;
        }
        if (local === MAX_U32) local = u64(view, field);
      }
      extra += 4 + length;
    }
    at = extraEnd + commentLength;
    if (flags & 1) throw new ZipError("Encrypted zip files cannot be imported.");

    let start: number | null = null;
    const dataStart = async () => {
      if (start !== null) return start;
      const header = await bytesOf(file, local, local + 30);
      if (header.getUint32(0, true) !== LOCAL) throw new ZipError(`Damaged zip entry: ${path}`);
      start = local + 30 + header.getUint16(26, true) + header.getUint16(28, true);
      return start;
    };
    const read = async (): Promise<Uint8Array> => {
      const from = await dataStart();
      const raw = new Uint8Array(await file.slice(from, from + compressed).arrayBuffer());
      if (method === 0) return raw;
      if (method === 8) return inflateSync(raw, { out: new Uint8Array(size) });
      throw new ZipError(`Unsupported compression in ${path}`);
    };
    entries.push({
      path,
      size,
      modified: dosDate(date, time),
      read,
      blob: async () => {
        if (method === 0) {
          const from = await dataStart();
          return file.slice(from, from + compressed);
        }
        return new Blob([(await read()) as BlobPart]);
      },
      text: async () => decoder.decode(await read()),
    });
  }
  return entries;
}
