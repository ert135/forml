import type { JsonValue } from './schema'

export function sameJson(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  if (left === right) return true
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) !== Array.isArray(right)) return false

  const entries: [string, JsonValue][] = Object.entries(left)
  const otherEntries = new Map<string, JsonValue>(Object.entries(right))
  return entries.length === otherEntries.size && entries.every(([key, value]) =>
    otherEntries.has(key) && sameJson(value, otherEntries.get(key)),
  )
}
