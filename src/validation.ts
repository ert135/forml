import { Effect } from 'effect'

import { FormValidationError } from './errors'
import { FormlType, type FormAnswers, type FormQuestion, type FormStep, type JsonValue } from './schema'
import { questionVisibility } from './visibility'

function questionError(question: FormQuestion, value: JsonValue | undefined): string | undefined {
  const singleChoice = question.type === FormlType.Select || question.type === FormlType.Radio
  const empty = value == null || (!singleChoice && typeof value === 'string' && !value.trim()) || (Array.isArray(value) && value.length === 0)

  if (question.required && (empty || (question.type === FormlType.Checkbox && value === false))) {
    return `${question.label} is required.`
  }
  if (value == null) return

  switch (question.type) {
    case FormlType.Text:
    case FormlType.Textarea:
    case FormlType.Email:
      if (typeof value !== 'string') return 'Enter a text value.'
      if (question.type === FormlType.Email && !empty && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
        return 'Enter a valid email address.'
      }
      return
    case FormlType.Checkbox:
      return typeof value === 'boolean' ? undefined : 'Choose whether to check this box.'
    case FormlType.Select:
    case FormlType.Radio:
      return question.options?.some((option) => option.value === value) ? undefined : 'Choose an available option.'
    case FormlType.Multiselect:
      if (!Array.isArray(value) || value.some((item) => !question.options?.some((option) => option.value === item))) {
        return 'Choose from the available options.'
      }
  }
}

export function answerErrors(steps: readonly FormStep[], answers: Readonly<FormAnswers>, stepId?: string): Readonly<Record<string, string>> {
  const fields: Record<string, string> = Object.create(null)
  const visibility = questionVisibility(steps, answers)

  for (const step of steps) {
    if (stepId !== undefined && step.id !== stepId) continue
    for (const question of step.questions) {
      if (!visibility.get(question.id)) continue
      const value = Object.hasOwn(answers, question.id) ? answers[question.id] : undefined
      const message = questionError(question, value)
      if (message) fields[question.id] = message
    }
  }
  return fields
}

export function validationError(fields: Readonly<Record<string, string>>): FormValidationError | undefined {
  if (Object.keys(fields).length) {
    return new FormValidationError({ message: 'Check the highlighted answers.', fields })
  }
}

export function validateAnswers(steps: readonly FormStep[], answers: Readonly<FormAnswers>): Effect.Effect<void, FormValidationError> {
  return Effect.suspend(() => {
    const error = validationError(answerErrors(steps, answers))
    return error ? Effect.fail(error) : Effect.void
  })
}
