import { customAlphabet } from "nanoid"

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
const nanoid = customAlphabet(ALPHABET, 16)

export function createId(prefix?: string): string {
  const id = nanoid()
  return prefix ? `${prefix}${id}` : id
}
