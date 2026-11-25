import { computed, shallowReactive, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'

import { sameJson } from './json'
import type { FormSchema } from './schema'
import { createFormState, type FormState } from './state'

export type FormSession<Extra extends object = object> = Omit<Extra, 'schema' | 'state'> & {
  readonly schema: FormSchema
  state: FormState
}

/** Keep a session for an equivalent schema; initialize fresh state and extra fields when it changes. */
export function useFormSession(schema: MaybeRefOrGetter<FormSchema>): ComputedRef<FormSession>
export function useFormSession<Extra extends object>(schema: MaybeRefOrGetter<FormSchema>, createExtra: () => Extra): ComputedRef<FormSession<Extra>>
export function useFormSession(schema: MaybeRefOrGetter<FormSchema>, createExtra?: () => object): ComputedRef<FormSession> {
  return computed<FormSession>((previous) => {
    const currentSchema = toValue(schema)
    if (previous && sameJson(previous.schema, currentSchema)) return previous
    return shallowReactive({
      ...createExtra?.(),
      schema: currentSchema,
      state: createFormState(currentSchema),
    })
  })
}
