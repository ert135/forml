import type { Effect } from 'effect'
import type { FormAction, FormlActionType, FormState } from './state'

/** Builds an Effect before Continue or Back moves to another step. */
export type FormStepChangeEffect = (
  action: Extract<FormAction, { readonly type: FormlActionType.Next | FormlActionType.Back }>,
  state: FormState,
) => Effect.Effect<unknown, unknown>
