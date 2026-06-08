const BASE64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const len = bytes.length
  if (len === 0) return ''

  const padding = (3 - (len % 3)) % 3
  const tripleCount = Math.ceil(len / 3)
  const encodedLen = tripleCount * 4
  const parts: string[] = []

  for (let tripleIdx = 0; tripleIdx < tripleCount; tripleIdx++) {
    const byteOffset = tripleIdx * 3
    const b0 = bytes[byteOffset]
    const b1 = byteOffset + 1 < len ? bytes[byteOffset + 1] : 0
    const b2 = byteOffset + 2 < len ? bytes[byteOffset + 2] : 0

    const triple = (b0 << 16) | (b1 << 8) | b2

    parts.push(
      BASE64_CHARS[(triple >> 18) & 0x3f],
      BASE64_CHARS[(triple >> 12) & 0x3f],
      BASE64_CHARS[(triple >> 6) & 0x3f],
      BASE64_CHARS[triple & 0x3f],
    )
  }

  const result = parts.join('')
  if (padding === 0) return result

  return result.slice(0, encodedLen - padding) + '='.repeat(padding)
}

const BASE64_LOOKUP = new Map<string, number>()
for (let i = 0; i < BASE64_CHARS.length; i++) {
  BASE64_LOOKUP.set(BASE64_CHARS[i], i)
}

export function base64ToUint8Array(base64: string): Uint8Array {
  let str = base64.replace(/=+$/, '')
  str = str.replace(/\s/g, '')

  if (str.length === 0) return new Uint8Array(0)

  const padding = (4 - (str.length % 4)) % 4
  const chunkCount = Math.ceil(str.length / 4)
  const outLen = chunkCount * 3 - padding
  const out = new Uint8Array(outLen)
  let outIdx = 0

  for (let i = 0; i < str.length; i += 4) {
    const c0 = BASE64_LOOKUP.get(str[i]) ?? 0
    const c1 = BASE64_LOOKUP.get(str[i + 1]) ?? 0
    const c2 = BASE64_LOOKUP.get(str[i + 2]) ?? 0
    const c3 = BASE64_LOOKUP.get(str[i + 3]) ?? 0

    const triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3

    if (outIdx < outLen) out[outIdx++] = (triple >> 16) & 0xff
    if (outIdx < outLen) out[outIdx++] = (triple >> 8) & 0xff
    if (outIdx < outLen) out[outIdx++] = triple & 0xff
  }

  return out
}

export function base64ToString(base64: string): string {
  const bytes = base64ToUint8Array(base64)
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}
