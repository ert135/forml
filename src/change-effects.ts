import type { Effect } from 'effect'
import type { FormAnswers, FormQuestion, JsonValue } from './schema'

export interface QuestionChangeContext {
  readonly question: FormQuestion
  readonly value: JsonValue
  readonly previousValue: JsonValue | undefined
  readonly answers: Readonly<FormAnswers>
}

export type QuestionChangeEffect = (context: QuestionChangeContext) => Effect.Effect<unknown, unknown>
export type QuestionChangeEffects = Readonly<Record<string, QuestionChangeEffect>>
