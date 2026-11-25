import type { Component } from 'vue'
import type { FormAnswers, FormQuestion, FormStep, JsonValue } from '../schema'

export interface StepComponentProps {
  readonly step: FormStep
  readonly answers: Readonly<FormAnswers>
}

export type StepComponentSlots = { default: () => unknown }

export interface ProgressComponentProps {
  readonly steps: readonly FormStep[]
  readonly stepIndex: number
}

export interface QuestionComponentProps {
  readonly question: FormQuestion
  readonly value?: JsonValue
  readonly inputId: string
  readonly describedBy?: string
  readonly error?: string
}

export type QuestionComponentEmits<Value extends JsonValue = JsonValue> = { answer: [value: Value] }

type Instance<C> = C extends abstract new (...args: never[]) => infer I ? I : never
type Props<C> = Instance<C> extends { $props: infer P } ? P : never
type Accepts<C, Expected> = keyof Expected extends keyof Props<C>
  ? Expected extends Props<C> ? true : false
  : false

type StepCheck<C> = Accepts<C, StepComponentProps> extends true
  ? Instance<C> extends { $slots: StepComponentSlots } ? C : never
  : never

type QuestionCheck<C> = Accepts<C, QuestionComponentProps> extends true
  ? 'onAnswer' extends keyof Props<C>
    ? NonNullable<Props<C>['onAnswer']> extends (value: infer Value) => unknown
      ? unknown extends Value ? never : [Value] extends [JsonValue] ? C : never
      : never
    : never
  : never

type Registry = Readonly<Record<string, Component>>
declare const stepRegistry: unique symbol
declare const questionRegistry: unique symbol
declare const progressComponent: unique symbol

export type StepComponents = Registry & { readonly [stepRegistry]: true }
export type QuestionComponents = Registry & { readonly [questionRegistry]: true }
export type ProgressComponent = Component & { readonly [progressComponent]: true }

export function defineProgressComponent<const Progress extends Component>(
  component: Progress & (Accepts<Progress, ProgressComponentProps> extends true ? unknown : never),
): Progress & ProgressComponent {
  const checked: Progress = component
  return checked as Progress & ProgressComponent
}

export function defineStepComponents<const Components extends Registry>(
  components: Components & { [Key in keyof Components]: StepCheck<Components[Key]> },
): Components & StepComponents {
  return components as Components & StepComponents
}

export function defineQuestionComponents<const Components extends Registry>(
  components: Components & { [Key in keyof Components]: QuestionCheck<Components[Key]> },
): Components & QuestionComponents {
  return components as Components & QuestionComponents
}
