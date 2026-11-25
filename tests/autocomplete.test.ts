// @vitest-environment jsdom
import { Effect } from 'effect'
import { afterEach, expect, expectTypeOf, test, vi } from 'vitest'
import { createApp, h, nextTick, shallowRef, type VNode } from 'vue'

import {
  createFormState,
  createSubmission,
  decodeForm,
  Forml,
  FormlActionType,
  FormlType,
  FormSchemaError,
  FormValidationError,
  validateAnswers,
  type AnswersFromSchema,
  type FormConfig,
  type FormState,
} from '../src'

const definition = {
  steps: [
    {
      id: 'location',
      title: 'Location',
      questions: [
        {
          id: 'city',
          type: FormlType.Autocomplete,
          label: 'City',
          required: true,
          description: 'Choose a city from the list.',
          options: [
            { label: 'Cardiff', value: 'cardiff' },
            { label: 'London', value: 0 },
            { label: 'No preference', value: false },
            { label: 'Any city', value: '' },
            { label: 'Zero (string)', value: '0' },
          ],
        },
      ],
    },
  ],
} as const satisfies FormConfig

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

function combo(root: HTMLElement) {
  return root.querySelector<HTMLInputElement>('[role="combobox"]')!
}

async function type(root: HTMLElement, text: string) {
  const input = combo(root)
  input.focus()
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
}

async function key(root: HTMLElement, key: string, isComposing = false) {
  const event = new KeyboardEvent('keydown', { key, isComposing, bubbles: true, cancelable: true })
  combo(root).dispatchEvent(event)
  await nextTick()
  return event
}

async function submit(root: HTMLElement) {
  root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await nextTick()
}

test('filters labels and selects a typed value with the keyboard without submitting the form', async () => {
  const onAction = vi.fn()
  const onSubmit = vi.fn()
  const root = mount(() => h(Forml, { schema: definition, onAction, onSubmit }))
  const input = combo(root)

  expect(input.getAttribute('aria-expanded')).toBe('false')
  expect(root.querySelector('label')?.htmlFor).toBe(input.id)
  input.focus()
  await nextTick()
  expect(root.querySelectorAll('[role="option"]')).toHaveLength(5)
  expect(root.querySelector('[role="listbox"]')?.id).toBe(input.getAttribute('aria-controls'))
  await type(root, 'LON')
  expect(root.querySelectorAll('[role="option"]')).toHaveLength(1)
  expect(root.querySelector('[role="option"]')?.textContent).toContain('London')
  expect(onAction).not.toHaveBeenCalled()

  await key(root, 'ArrowDown')
  expect(input.getAttribute('aria-activedescendant')).toBe(root.querySelector('[role="option"]')?.id)
  expect(root.querySelector('[role="option"]')?.getAttribute('aria-selected')).toBe('true')
  const enter = await key(root, 'Enter')
  expect(enter.defaultPrevented).toBe(true)
  expect(onSubmit).not.toHaveBeenCalled()
  expect(onAction).toHaveBeenCalledExactlyOnceWith(
    { type: FormlActionType.Answer, questionId: 'city', value: 0 },
    expect.objectContaining({ answers: { city: 0 } }),
  )
  expect(input.value).toBe('London')
  expect(input.getAttribute('aria-expanded')).toBe('false')
  expect(input.hasAttribute('aria-activedescendant')).toBe(false)
  expect(document.activeElement).toBe(input)

  await submit(root)
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ request: { city: 0 }, sent: false })
})

test.each(definition.steps[0].questions[0].options)('selects $label by pointer and submits its original value', async ({ label, value }) => {
  const onSubmit = vi.fn()
  const root = mount(() => h(Forml, { schema: definition, onSubmit }))
  combo(root).focus()
  await nextTick()
  const option = [...root.querySelectorAll<HTMLElement>('[role="option"]')].find((item) => item.textContent?.trim() === label)!
  const pointer = new Event('pointerdown', { bubbles: true, cancelable: true })
  option.dispatchEvent(pointer)
  expect(pointer.defaultPrevented).toBe(true)
  option.click()
  await nextTick()

  expect(combo(root).value).toBe(label)
  await submit(root)
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ request: { city: value }, sent: false })
})

test('clears a stale selection while searching and supports an explicit clear button', async () => {
  const state = shallowRef(createFormState(definition, { city: 'cardiff' }))
  const root = mount(() =>
    h(Forml, {
      schema: definition,
      state: state.value,
      'onUpdate:state': (next: FormState) => {
        state.value = next
      },
    }),
  )
  expect(combo(root).value).toBe('Cardiff')
  await type(root, 'lon')
  expect(state.value.answers.city).toBeNull()
  expect(combo(root).value).toBe('lon')
  await key(root, 'ArrowDown')
  await key(root, 'Enter')
  expect(state.value.answers.city).toBe(0)

  root.querySelector<HTMLButtonElement>('button[aria-label="Clear City"]')!.click()
  await nextTick()
  expect(state.value.answers.city).toBeNull()
  expect(combo(root).value).toBe('')
  expect(document.activeElement).toBe(combo(root))
  expect(root.querySelectorAll('[role="option"]')).toHaveLength(5)

  await type(root, 'not a city')
  combo(root).blur()
  await nextTick()
  expect(combo(root).value).toBe('')
  expect(state.value.answers.city).toBeNull()

  state.value = createFormState(definition, { city: false })
  await nextTick()
  expect(combo(root).value).toBe('No preference')
  expect(combo(root).getAttribute('aria-expanded')).toBe('false')
})

test('announces no matches, ignores composition Enter, and does not accept arbitrary search text', async () => {
  const onSubmit = vi.fn()
  const onError = vi.fn()
  const root = mount(() => h(Forml, { schema: definition, onSubmit, onError }))
  await type(root, 'Atlantis')
  expect(root.querySelector('[role="status"]')?.textContent).toBe('No matching options.')
  await key(root, 'ArrowDown')
  expect(combo(root).hasAttribute('aria-activedescendant')).toBe(false)
  expect((await key(root, 'Enter')).defaultPrevented).toBe(true)
  expect(onSubmit).not.toHaveBeenCalled()

  await type(root, 'lon')
  await key(root, 'ArrowDown')
  expect((await key(root, 'Enter', true)).defaultPrevented).toBe(false)
  expect(combo(root).getAttribute('aria-expanded')).toBe('true')
  await key(root, 'Escape')
  expect(combo(root).value).toBe('')
  expect(root.querySelector('[role="listbox"]')).toBeNull()
  await submit(root)
  expect(onError).toHaveBeenCalledWith(expect.any(FormValidationError))
  expect(combo(root).getAttribute('aria-invalid')).toBe('true')
  for (const id of combo(root).getAttribute('aria-describedby')!.split(' ')) {
    expect(document.getElementById(id)).not.toBeNull()
  }
  expect(onSubmit).not.toHaveBeenCalled()
})

test('Escape and Tab dismiss highlighted options without changing the selected value', async () => {
  const state = shallowRef(createFormState(definition, { city: 'cardiff' }))
  const root = mount(() =>
    h(Forml, {
      schema: definition,
      state: state.value,
      'onUpdate:state': (next: FormState) => {
        state.value = next
      },
    }),
  )
  combo(root).focus()
  await nextTick()
  await key(root, 'ArrowDown')
  await key(root, 'Escape')
  expect(combo(root).value).toBe('Cardiff')
  expect(state.value.answers.city).toBe('cardiff')
  await key(root, 'ArrowUp')
  expect(root.querySelector('[aria-selected="true"]')?.textContent).toContain('Zero (string)')
  expect((await key(root, 'Tab')).defaultPrevented).toBe(false)
  expect(combo(root).getAttribute('aria-expanded')).toBe('false')
  expect(state.value.answers.city).toBe('cardiff')
})

test('preserves a selection when moving between form steps', async () => {
  const schema = { steps: [...definition.steps, { id: 'review', title: 'Review', questions: [] }] } as const
  const root = mount(() => h(Forml, { schema }))
  await type(root, 'Card')
  await key(root, 'ArrowDown')
  await key(root, 'Enter')
  await submit(root)
  expect(root.querySelector('h2')?.textContent).toBe('Review')
  root.querySelector<HTMLButtonElement>('button[type="button"]')!.click()
  await nextTick()
  expect(combo(root).value).toBe('Cardiff')
})

test('validates autocomplete option membership and infers the option value union', () => {
  expectTypeOf<AnswersFromSchema<typeof definition>['city']>().toEqualTypeOf<'cardiff' | 0 | false | '' | '0'>()
  expect(Effect.runSync(decodeForm(definition))).toEqual(definition)
  for (const { value } of definition.steps[0].questions[0].options) {
    expect(Effect.runSync(validateAnswers(definition.steps, { city: value }))).toBeUndefined()
  }
  const invalid = Effect.runSync(Effect.flip(validateAnswers(definition.steps, { city: 'London' })))
  expect(invalid.fields).toEqual({ city: 'Choose an available option.' })
  const submission = createSubmission({ schema: definition, transform: (answers) => ({ city: answers.city }) })
  expect(Effect.runSync(submission({ city: false }))).toEqual({ request: { city: false }, sent: false })
})

test('requires autocomplete options in the schema', () => {
  const schema = { steps: [{ ...definition.steps[0], questions: [{ ...definition.steps[0].questions[0], options: [] }] }] }
  const error = Effect.runSync(Effect.flip(decodeForm(schema)))
  expect(error).toBeInstanceOf(FormSchemaError)
  expect(error.message).toContain('needs at least one option')
})
