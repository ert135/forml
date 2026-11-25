import { FormlType, type FormAnswers, type FormSchema, type JsonValue } from './schema'
import { answerErrors, type QuestionValidators } from './validation'
import { questionVisibility } from './visibility'

export interface FormState {
  readonly stepId: string
  readonly answers: Readonly<FormAnswers>
  readonly errors: Readonly<Record<string, string>>
}

export enum FormlActionType {
  Answer = 'answer',
  Back = 'back',
  Next = 'next',
  Submit = 'submit',
}

export type FormAction =
  | {
      readonly type: FormlActionType.Answer
      readonly questionId: string
      readonly value: JsonValue
    }
  | { readonly type: FormlActionType.Back }
  | { readonly type: FormlActionType.Next }
  | { readonly type: FormlActionType.Submit }

export function createFormState(form: FormSchema, initialAnswers: Readonly<FormAnswers> = {}): FormState {
  const answers: [string, JsonValue][] = []

  for (const step of form.steps) {
    for (const { id, defaultValue, type } of step.questions) {
      const initial = Object.hasOwn(initialAnswers, id) ? initialAnswers[id] : undefined
      if (initial !== undefined) answers.push([id, initial])
      else if (defaultValue !== undefined) answers.push([id, defaultValue])
      else if (type === FormlType.Multiselect) answers.push([id, []])
    }
  }

  return {
    stepId: form.steps[0].id,
    answers: Object.fromEntries(answers),
    errors: Object.create(null),
  }
}

export function reduceForm(form: FormSchema, state: FormState, action: FormAction, questionValidators?: QuestionValidators): FormState {
  const index = Math.max(
    0,
    form.steps.findIndex((step) => step.id === state.stepId),
  )
  const current = form.steps[index]

  switch (action.type) {
    case FormlActionType.Answer: {
      if (!form.steps.some((step) => step.questions.some((question) => question.id === action.questionId))) {
        return state
      }
      const answers = { ...state.answers, [action.questionId]: action.value }
      const errors: Record<string, string> = Object.create(null)
      const visibility = questionVisibility(form.steps, answers)
      for (const [id, message] of Object.entries(state.errors)) {
        if (id !== action.questionId && visibility.get(id) !== false) errors[id] = message
      }
      return { ...state, answers, errors }
    }
    case FormlActionType.Back: {
      const previous = form.steps[index - 1]
      return previous ? { ...state, stepId: previous.id, errors: Object.create(null) } : state
    }
    case FormlActionType.Next: {
      const errors = answerErrors(form.steps, state.answers, current.id, questionValidators)
      const next = Object.keys(errors).length ? current : (form.steps[index + 1] ?? current)
      return { ...state, stepId: next.id, errors }
    }
    case FormlActionType.Submit: {
      const errors = answerErrors(form.steps, state.answers, undefined, questionValidators)
      const invalid = form.steps.find((step) => step.questions.some((question) => Object.hasOwn(errors, question.id)))
      return { ...state, stepId: (invalid ?? current).id, errors }
    }
  }
}
