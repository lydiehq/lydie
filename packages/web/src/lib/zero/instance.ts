import { Zero } from "@rocicorp/zero"
import { mutators } from "@lydie/zero/mutators"
import { schema, type Schema } from "@lydie/zero/schema"

const ZERO_INSTANCE_KEY = Symbol.for("__lydie_zero_instance__")

interface GlobalWithZero {
  [ZERO_INSTANCE_KEY]?: Zero<Schema>
}

export function getZeroInstance(auth: any): Zero<Schema> {
  const globalWithZero = globalThis as GlobalWithZero

  const userID = auth?.session?.userId ?? "anon"
  const cacheURL = auth?.session ? import.meta.env.VITE_ZERO_URL : undefined

  if (globalWithZero[ZERO_INSTANCE_KEY]) {
    const existingInstance = globalWithZero[ZERO_INSTANCE_KEY]

    if (existingInstance && (existingInstance as any).userID === userID) {
      return existingInstance
    }
  }

  const newInstance = new Zero({
    userID,
    schema,
    context: auth?.session,
    cacheURL,
    mutators,
  })

  globalWithZero[ZERO_INSTANCE_KEY] = newInstance

  return newInstance
}

export function clearZeroInstance(): void {
  const globalWithZero = globalThis as GlobalWithZero
  if (globalWithZero[ZERO_INSTANCE_KEY]) {
    console.log("Clearing Zero instance")
    delete globalWithZero[ZERO_INSTANCE_KEY]
  }
}
