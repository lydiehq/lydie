export function base64ToUint8Array(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binaryString = ""
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]!)
  }
  return btoa(binaryString)
}
