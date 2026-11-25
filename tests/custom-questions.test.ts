// @vitest-environment jsdom
import { Effect } from 'effect'
import { afterEach, expect, test, vi } from 'vitest'
import { createApp, h, nextTick, type VNode } from 'vue'

import RemovalsInput from '../.storybook/demoComponents/RemovalsInput.vue'
import { questionValidators as demoValidators } from '../demo/questionValidators'
import {
  createFormState,
  createSubmission,
  decodeForm,
  defineQuestionComponents,
  Forml,
  FormlActionType,
  FormlType,
  FormSchemaError,
  FormValidationError,
  reduceForm,
  validateAnswers,
  type FormConfig,
  type QuestionValidator,
  type QuestionValidators,
} from '../src'

const cleanup: (() => void)[] = []
afterEach(() => {
  for (const unmount of cleanup.splice(0)) unmount()
})

function mount(render: () => VNode) {
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp({ render })
  app.mount(root)
  cleanup.push(() => {
    app.unmount()
    root.remove()
  })
  return root
}

async function submit(root: HTMLElement) {
  root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await nextTick()
}

async function enter(root: HTMLElement, name: string, value: string) {
  const input = root.querySelector<HTMLInputElement>(`input[name="${name}"]`)!
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  return input
}

const schema = {
  steps: [
    {
      id: 'booking',
      title: 'Booking',
      questions: [
        {
          id: 'date',
          type: 'date',
          label: 'Date',
          description: 'Choose a date in 2030 or later.',
          required: true,
          props: { min: '2030-01-01' },
        },
      ],
    },
    {
      id: 'contact',
      title: 'Contact',
      questions: [{ id: 'phone', type: 'tel', label: 'Phone', required: true, props: { minDigits: 7 } }],
    },
  ],
} as const satisfies FormConfig<'date' | 'tel'>
const questionComponents = defineQuestionComponents({ date: RemovalsInput, tel: RemovalsInput })

test('renders custom types, passes configuration, and blocks navigation before running step effects', async () => {
  const beforeStepChange = vi.fn(() => Effect.void)
  const onSubmit = vi.fn()
  const onError = vi.fn()
  const root = mount(() => h(Forml, { schema, questionComponents, questionValidators: demoValidators, beforeStepChange, onSubmit, onError }))
  const date = root.querySelector<HTMLInputElement>('input[name="date"]')!
  expect(date.type).toBe('date')
  expect(date.min).toBe('2030-01-01')
  expect(root.querySelector('label')?.htmlFor).toBe(date.id)

  await submit(root)
  expect(root.textContent).toContain('Date is required.')
  await enter(root, 'date', '2029-12-31')
  await submit(root)
  expect(beforeStepChange).not.toHaveBeenCalled()
  expect(root.querySelector('h2')?.textContent).toBe('Booking')
  expect(root.textContent).toContain('Choose a date on or after 2030-01-01.')
  expect(date.getAttribute('aria-invalid')).toBe('true')
  expect(document.activeElement).toBe(date)
  for (const id of date.getAttribute('aria-describedby')!.split(' ')) expect(document.getElementById(id)).not.toBeNull()
  expect(onError).toHaveBeenLastCalledWith(expect.any(FormValidationError))

  await enter(root, 'date', '2030-06-15')
  expect(date.hasAttribute('aria-invalid')).toBe(false)
  await submit(root)
  await vi.waitFor(() => expect(root.querySelector('h2')?.textContent).toBe('Contact'))
  expect(beforeStepChange).toHaveBeenCalledOnce()

  const phone = await enter(root, 'phone', '123')
  await submit(root)
  expect(phone.getAttribute('aria-invalid')).toBe('true')
  expect(root.textContent).toContain('Enter a phone number with at least 7 digits.')
  expect(onSubmit).not.toHaveBeenCalled()
  await enter(root, 'phone', '+44 7700 900123')
  await submit(root)
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ request: { date: '2030-06-15', phone: '+44 7700 900123' }, sent: false })
})

test('reports missing custom components instead of silently falling back to text', () => {
  const onError = vi.fn()
  const root = mount(() => h(Forml, { schema, onError }))
  expect(root.querySelector('form')).toBeNull()
  expect(root.querySelector('[role="alert"]')?.textContent).toBe('Register a question component for "date".')
  expect(onError).toHaveBeenCalledWith(expect.any(FormSchemaError))
})

test('runs pure rules only on Next and Submit and revalidates earlier steps on submission', () => {
  const date = vi.fn<QuestionValidator>(demoValidators.date)
  const phone = vi.fn<QuestionValidator>(demoValidators.tel)
  const validators = { date, tel: phone }
  const initial = createFormState(schema, { date: '2029-12-31', phone: '07700 900123' })
  Object.freeze(initial.answers)
  Object.freeze(initial.errors)
  Object.freeze(initial)
  const next = reduceForm(schema, initial, { type: FormlActionType.Next }, validators)
  expect(next.stepId).toBe('booking')
  expect(next.errors).toEqual({ date: 'Choose a date on or after 2030-01-01.' })
  expect(initial.errors).toEqual({})
  expect(date).toHaveBeenCalledExactlyOnceWith({ question: schema.steps[0].questions[0], value: '2029-12-31', answers: initial.answers })
  expect(phone).not.toHaveBeenCalled()

  const contact = { ...initial, stepId: 'contact' }
  const submitted = reduceForm(schema, contact, { type: FormlActionType.Submit }, validators)
  expect(submitted.stepId).toBe('booking')
  expect(submitted.errors).toEqual(next.errors)
  expect(phone).toHaveBeenCalledOnce()

  date.mockClear()
  phone.mockClear()
  expect(reduceForm(schema, contact, { type: FormlActionType.Back }, validators).stepId).toBe('booking')
  reduceForm(schema, initial, { type: FormlActionType.Answer, questionId: 'date', value: '2030-01-01' }, validators)
  expect(date).not.toHaveBeenCalled()
  expect(phone).not.toHaveBeenCalled()
})

test('runs required and built-in checks first, while custom types without rules remain supported', () => {
  const custom = vi.fn<QuestionValidator>(() => undefined)
  const email = vi.fn<QuestionValidator>(() => 'Use your work email.')
  const form = {
    steps: [
      {
        id: 'details',
        title: 'Details',
        questions: [
          { id: 'data', type: 'custom', label: 'Data', required: true },
          { id: 'email', type: FormlType.Email, label: 'Email' },
        ],
      },
    ],
  } as const satisfies FormConfig<'custom'>
  const validators = { custom, email }
  const error = Effect.runSync(Effect.flip(validateAnswers(form.steps, { email: 'invalid' }, validators)))
  expect(error.fields).toEqual({ data: 'Data is required.', email: 'Enter a valid email address.' })
  expect(custom).not.toHaveBeenCalled()
  expect(email).not.toHaveBeenCalled()
  const additional = Effect.runSync(Effect.flip(validateAnswers(form.steps, { data: false, email: 'a@example.com' }, validators)))
  expect(additional.fields).toEqual({ email: 'Use your work email.' })
  expect(custom).toHaveBeenCalledWith(expect.objectContaining({ value: false }))

  const value = { address: 'Home', coordinates: [51.5, -0.1] }
  const decoded = Effect.runSync(decodeForm(form))
  expect(Effect.runSync(createSubmission({ schema: decoded, transform: (answers) => answers })({ data: value }))).toEqual({
    request: { data: value },
    sent: false,
  })
})

test('skips hidden and missing custom answers but validates falsy supplied values', () => {
  const form = {
    steps: [
      {
        id: 'details',
        title: 'Details',
        questions: [
          { id: 'show', type: FormlType.Checkbox, label: 'Show' },
          { id: 'data', type: 'custom', label: 'Data', showWhen: { show: [true] } },
        ],
      },
    ],
  } as const satisfies FormConfig<'custom'>
  const custom = vi.fn<QuestionValidator>(() => 'Rejected.')
  for (const answers of [{ show: false, data: 'bad' }, { show: true }, { show: true, data: null }]) {
    expect(Effect.runSync(validateAnswers(form.steps, answers, { custom }))).toBeUndefined()
  }
  expect(custom).not.toHaveBeenCalled()
  for (const data of [false, 0, '']) {
    expect(Effect.runSync(Effect.flip(validateAnswers(form.steps, { show: true, data }, { custom })))).toMatchObject({
      fields: { data: 'Rejected.' },
    })
  }
  expect(custom).toHaveBeenCalledTimes(3)
})

test('uses the same rules for lazy headless submission and skips transform/send on failure', () => {
  const date = vi.fn<QuestionValidator>(demoValidators.date)
  const questionValidators = { ...demoValidators, date }
  const transform = vi.fn((answers) => answers)
  const send = vi.fn(() => Effect.succeed('sent'))
  const submission = createSubmission({ schema, questionValidators, transform, send })
  const effect = submission({ date: '2030-02-30', phone: '07700 900123' })
  expect(date).not.toHaveBeenCalled()
  const error = Effect.runSync(Effect.flip(effect))
  expect(error).toMatchObject({ fields: { date: 'Enter a valid date.' } })
  expect(transform).not.toHaveBeenCalled()
  expect(send).not.toHaveBeenCalled()
  expect(Effect.runSync(submission({ date: '2032-02-29', phone: '07700 900123' }))).toMatchObject({ sent: true, response: 'sent' })
})

test('provides the same answers to cross-field rules before projecting hidden answers out of a request', () => {
  const form = {
    steps: [
      {
        id: 'details',
        title: 'Details',
        questions: [
          { id: 'show', type: FormlType.Checkbox, label: 'Show' },
          { id: 'previous', type: FormlType.Text, label: 'Previous', showWhen: { show: [true] } },
          { id: 'data', type: 'custom', label: 'Data' },
        ],
      },
    ],
  } as const satisfies FormConfig<'custom'>
  const questionValidators = {
    custom: ({ answers }) => (answers.data === answers.previous ? 'Choose a new value.' : undefined),
  } satisfies QuestionValidators
  const answers = { show: false, previous: 'same', data: 'same' }
  const state = createFormState(form, answers)
  const submission = createSubmission({ schema: form, questionValidators, transform: (answers) => answers })
  const errors = reduceForm(form, state, { type: FormlActionType.Submit }, questionValidators).errors
  expect(errors).toEqual({ data: 'Choose a new value.' })
  expect(Effect.runSync(Effect.flip(submission(answers)))).toMatchObject({ fields: errors })
  expect(Effect.runSync(submission({ ...answers, data: 'new' })).request).toEqual({ show: false, data: 'new' })
})

test('does not treat inherited registry properties as custom validators', () => {
  const form = {
    steps: [{ id: 'details', title: 'Details', questions: [{ id: 'data', type: 'toString', label: 'Data' }] }],
  } as const satisfies FormConfig<'toString'>
  expect(Effect.runSync(validateAnswers(form.steps, { data: 42 }, {}))).toBeUndefined()
})
