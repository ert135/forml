import { Effect, Schema } from 'effect'

import { FormLoadError, FormSchemaError } from './errors'
import { showWhenError } from './visibility'

export enum FormlType {
  Text = 'text',
  Email = 'email',
  Textarea = 'textarea',
  Select = 'select',
  Autocomplete = 'autocomplete',
  Multiselect = 'multiselect',
  Radio = 'radio',
  Checkbox = 'checkbox',
}

const ChoiceValue = Schema.Union([Schema.String, Schema.Finite, Schema.Boolean])
const ShowWhen = Schema.Record(Schema.NonEmptyString, Schema.NonEmptyArray(Schema.Union([ChoiceValue, Schema.Null])))

const Option = Schema.Struct({
  label: Schema.NonEmptyString,
  value: ChoiceValue,
})

const Question = Schema.Struct({
  id: Schema.NonEmptyString,
  type: Schema.NonEmptyString,
  label: Schema.NonEmptyString,
  description: Schema.optional(Schema.String),
  placeholder: Schema.optional(Schema.String),
  required: Schema.optional(Schema.Boolean),
  options: Schema.optional(Schema.Array(Option)),
  defaultValue: Schema.optional(Schema.Json),
  effectOnChange: Schema.optional(Schema.NonEmptyString),
  showWhen: Schema.optional(ShowWhen),
  props: Schema.optional(Schema.JsonObject),
})

const Step = Schema.Struct({
  id: Schema.NonEmptyString,
  title: Schema.NonEmptyString,
  description: Schema.optional(Schema.String),
  component: Schema.optional(Schema.NonEmptyString),
  questions: Schema.Array(Question),
  props: Schema.optional(Schema.JsonObject),
})

const Definition = Schema.Struct({ steps: Schema.NonEmptyArray(Step) })

export type FormQuestion<Type extends string = string> = Omit<typeof Question.Type, 'type'> & {
  readonly type: Type
}
export type FormStep<Type extends string = string> = Omit<typeof Step.Type, 'questions'> & {
  readonly questions: readonly FormQuestion<Type>[]
}
export type FormSchema<Type extends string = string> = {
  readonly steps: readonly [FormStep<Type>, ...FormStep<Type>[]]
}
export type FormConfig<CustomType extends string = never> = FormSchema<FormlType | CustomType>
export type ChoiceOption = typeof Option.Type
export type JsonValue = Schema.Json
export type FormAnswers = Partial<Record<string, JsonValue>>
export type ShowWhen = typeof ShowWhen.Type

type Questions<Definition extends FormSchema> = Definition['steps'][number]['questions'][number]

type ChoiceValue<Question extends FormQuestion> = Question extends {
  readonly options: readonly (infer Option extends ChoiceOption)[]
}
  ? Option['value']
  : ChoiceOption['value']

type AnswerValue<Question extends FormQuestion> = Question['type'] extends `${FormlType.Text | FormlType.Email | FormlType.Textarea}`
  ? string
  : Question['type'] extends `${FormlType.Checkbox}`
    ? boolean
    : Question['type'] extends `${FormlType.Select | FormlType.Autocomplete | FormlType.Radio}`
      ? ChoiceValue<Question>
      : Question['type'] extends `${FormlType.Multiselect}`
        ? readonly ChoiceValue<Question>[]
        : JsonValue

type TupleIndices<Items extends readonly unknown[]> = Extract<keyof Items, `${number}`>
type IsUnion<Value, Whole = Value> = Value extends unknown ? ([Whole] extends [Value] ? false : true) : never

// An always-visible question with a single ID establishes a required answer key.
type RequiredId<Question> = [Question] extends [{ readonly required: true; readonly id: infer Id extends string; readonly showWhen?: undefined }]
  ? {} extends Record<Id, never>
    ? never
    : IsUnion<Id> extends false
      ? Id
      : never
  : never

type RequiredQuestionIds<Items extends readonly FormQuestion[]> = {
  [Index in TupleIndices<Items>]: RequiredId<Items[Index]>
}[TupleIndices<Items>]

type RequiredIds<Steps extends readonly FormStep[]> = {
  [Index in TupleIndices<Steps>]: RequiredQuestionIds<Steps[Index]['questions']>
}[TupleIndices<Steps>]

type KnownAnswers<Question extends FormQuestion, Required extends string> = {
  readonly [Item in Question as Extract<Item['id'], Required>]: NonNullable<AnswerValue<Item>>
} & {
  readonly [Item in Question as Exclude<Item['id'], Required>]?: AnswerValue<Item> | null
}

export type AnswersFromSchema<Definition extends FormSchema> = Definition extends FormSchema
  ? string extends Questions<Definition>['id']
    ? Readonly<FormAnswers>
    : KnownAnswers<Questions<Definition>, RequiredIds<Definition['steps']>>
  : never

const choiceTypes = new Set<string>([FormlType.Select, FormlType.Autocomplete, FormlType.Multiselect, FormlType.Radio])

export function decodeForm(input: unknown): Effect.Effect<FormSchema, FormSchemaError> {
  return Schema.decodeUnknownEffect(Definition)(input).pipe(
    Effect.mapError((cause) => new FormSchemaError({ message: cause.message, cause })),
    Effect.flatMap((form) => {
      const stepIds = new Set<string>()
      const questions = new Map<string, FormQuestion>()

      for (const step of form.steps) {
        if (stepIds.has(step.id)) {
          return Effect.fail(new FormSchemaError({ message: `Duplicate step ID "${step.id}".` }))
        }
        stepIds.add(step.id)

        for (const question of step.questions) {
          if (questions.has(question.id)) {
            return Effect.fail(new FormSchemaError({ message: `Duplicate question ID "${question.id}".` }))
          }
          questions.set(question.id, question)

          if (choiceTypes.has(question.type) && !question.options?.length) {
            return Effect.fail(
              new FormSchemaError({
                message: `Question "${question.id}" needs at least one option.`,
              }),
            )
          }
          if (question.options && new Set(question.options.map(({ value }) => value)).size !== question.options.length) {
            return Effect.fail(
              new FormSchemaError({
                message: `Question "${question.id}" has duplicate option values.`,
              }),
            )
          }
        }
      }

      const visibilityError = showWhenError(questions)
      return visibilityError ? Effect.fail(new FormSchemaError({ message: visibilityError })) : Effect.succeed(form)
    }),
  )
}

export function loadForm<Failure, Requirements>(
  source: Effect.Effect<unknown, Failure, Requirements>,
): Effect.Effect<FormSchema, FormLoadError | FormSchemaError, Requirements> {
  return source.pipe(
    Effect.mapError((cause) => new FormLoadError({ message: 'Could not load the form configuration.', cause })),
    Effect.flatMap(decodeForm),
  )
}
