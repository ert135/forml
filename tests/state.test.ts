import { Effect } from 'effect'
import { expect, test } from 'vitest'

import { createFormState, FormlActionType, reduceForm, validateAnswers, type FormState, type JsonValue } from '../src'
import { form } from './fixtures'

const next = { type: FormlActionType.Next } as const
const back = { type: FormlActionType.Back } as const
const submit = { type: FormlActionType.Submit } as const

function answer(state: FormState, questionId: string, value: JsonValue) {
  return reduceForm(form, state, { type: FormlActionType.Answer, questionId, value })
}

test('initializes defaults and preserves valid falsy initial answers', () => {
  expect(createFormState(form)).toEqual({
    stepId: 'preferences',
    answers: { newsletter: false, topics: [], channel: false },
    errors: {},
  })
  expect(createFormState(form, { name: '', channel: 0, unrecognized: 'ignored' }).answers).toEqual({
    name: '',
    newsletter: false,
    topics: [],
    channel: 0,
  })
})

test('validates before moving forward and clears the edited field error in a new snapshot', () => {
  const initial = createFormState(form)
  const blocked = reduceForm(form, initial, next)
  Object.freeze(blocked.answers)
  Object.freeze(blocked.errors)
  Object.freeze(blocked)

  expect(blocked.stepId).toBe('preferences')
  expect(blocked.errors).toEqual({ name: 'Name is required.' })
  expect(initial.errors).toEqual({})

  const answered = answer(blocked, 'name', 'Ada')
  expect(answered.answers.name).toBe('Ada')
  expect(answered.errors).toEqual({})
  expect(blocked.answers.name).toBeUndefined()
  expect(blocked.errors.name).toBe('Name is required.')
  expect(answer(answered, 'unrecognized', 'ignored')).toBe(answered)

  const contact = reduceForm(form, answered, next)
  expect(contact.stepId).toBe('contact')
  expect(reduceForm(form, contact, back)).toEqual(answered)
  expect(reduceForm(form, answered, back)).toBe(answered)
})

test('validates every step on submit and returns to the first invalid step', () => {
  const contact = { ...createFormState(form, { email: 'incorrect' }), stepId: 'contact' }

  const result = reduceForm(form, contact, submit)

  expect(result.stepId).toBe('preferences')
  expect(result.errors).toEqual({
    name: 'Name is required.',
    email: 'Enter a valid email address.',
  })
})

test('checks all visibility rules, clears hidden errors, and restores retained answers', () => {
  const initial = createFormState(form, {
    name: 'Ada',
    email: 'ada@example.com',
    newsletter: true,
    topics: ['work'],
    company: 'Example Ltd',
  })
  const blocked = reduceForm(form, initial, submit)
  expect(blocked.errors).toEqual({ reference: 'Reference is required.' })

  const hidden = answer(blocked, 'topics', ['hobbies'])
  expect(hidden.errors).toEqual({})
  expect(hidden.answers.company).toBe('Example Ltd')
  expect(reduceForm(form, hidden, submit).errors).toEqual({})

  const restored = answer(hidden, 'topics', ['hobbies', 'work'])
  expect(reduceForm(form, restored, submit).errors).toEqual({ reference: 'Reference is required.' })
  expect(reduceForm(form, answer(restored, 'newsletter', false), submit).errors).toEqual({})
})

test('validates answer types and option membership', () => {
  const invalid = { name: 42, newsletter: 'yes', topics: ['unknown'], email: 'bad', channel: '0' }

  const error = Effect.runSync(Effect.flip(validateAnswers(form.steps, invalid)))
  expect(error.fields).toEqual({
    name: 'Enter a text value.',
    newsletter: 'Choose whether to check this box.',
    topics: 'Choose from the available options.',
    email: 'Enter a valid email address.',
    channel: 'Choose an available option.',
  })
  expect(
    Effect.runSync(
      validateAnswers(form.steps, {
        name: 'Ada',
        newsletter: false,
        topics: [],
        email: 'ada@example.com',
        channel: 0,
      }),
    ),
  ).toBeUndefined()
})
