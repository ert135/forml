// @vitest-environment jsdom
import { createFormState, Forml, FormlActionType, reduceForm } from 'forml'
import { useFormSession, type FormSession } from 'forml/form'
import type { FormSchema, FormState } from 'forml/types'
import { expect, expectTypeOf, test, vi } from 'vitest'
import { computed, createApp, h, isReactive, nextTick, shallowRef } from 'vue'

import { form } from './fixtures'

test('accepts a schema, ref, or getter and keeps state snapshots shallow and independent', () => {
  const source = shallowRef<FormSchema>(form)
  const sessions = [useFormSession(form), useFormSession(source), useFormSession(() => source.value)]
  for (const session of sessions) {
    expect(session.value.state).toEqual(createFormState(form))
    expect(isReactive(session.value)).toBe(true)
    expect(isReactive(session.value.state)).toBe(false)
  }

  const session = sessions[0]
  const initial = session.value.state
  Object.freeze(initial.answers)
  Object.freeze(initial.errors)
  Object.freeze(initial)
  const name = computed(() => session.value.state.answers.name)
  expect(name.value).toBeUndefined()
  session.value.state = reduceForm(form, initial, { type: FormlActionType.Answer, questionId: 'name', value: 'Ada' })
  expect(name.value).toBe('Ada')
  expect(initial.answers.name).toBeUndefined()
  expect(sessions[1].value.state.answers.name).toBeUndefined()
  expect(sessions[2].value.state.answers.name).toBeUndefined()
})

test('preserves navigation, errors, and custom data for equivalent schemas and resets them together on replacement', async () => {
  const schema = shallowRef<FormSchema>(form)
  const initialize = vi.fn((): { postcodeStatus?: string } => ({}))
  const session = useFormSession(schema, initialize)
  const previous = session.value
  const savedState: FormState = {
    stepId: 'contact',
    answers: { name: 'Ada' },
    errors: { email: 'Email is required.' },
  }
  previous.state = savedState
  previous.postcodeStatus = 'Cardiff'

  schema.value = JSON.parse(JSON.stringify(form))
  expect(session.value).toBe(previous)
  expect(session.value.state).toBe(savedState)
  expect(session.value.postcodeStatus).toBe('Cardiff')
  expect(initialize).toHaveBeenCalledTimes(1)

  let finishLookup!: (value: string) => void
  const lookup = new Promise<string>((resolve) => {
    finishLookup = resolve
  }).then((value) => {
    previous.postcodeStatus = value
  })
  schema.value = { steps: [form.steps[1]] }
  expect(session.value).not.toBe(previous)
  expect(session.value.schema).toBe(schema.value)
  expect(session.value.state).toEqual(createFormState(schema.value))
  expect(session.value.postcodeStatus).toBeUndefined()
  expect(initialize).toHaveBeenCalledTimes(2)
  expect(previous.state).toBe(savedState)

  finishLookup('Late result')
  await lookup
  expect(previous.postcodeStatus).toBe('Late result')
  expect(session.value.postcodeStatus).toBeUndefined()
})

test('infers custom fields, keeps them reactive, and reserves the library schema and state fields', () => {
  const session = useFormSession(form, () => ({ schema: 'ignored', state: null, status: 'Ready' }))
  expectTypeOf(session.value).toEqualTypeOf<FormSession<{ schema: string; state: null; status: string }>>()
  expectTypeOf(session.value.schema).toEqualTypeOf<FormSchema>()
  expectTypeOf(session.value.state).toEqualTypeOf<FormState>()
  expectTypeOf(session.value.status).toEqualTypeOf<string>()
  const status = computed(() => session.value.status)
  expect(status.value).toBe('Ready')
  session.value.status = 'Done'
  expect(status.value).toBe('Done')
  expect(session.value.schema).toBe(form)
  expect(session.value.state).toEqual(createFormState(form))
})

test('works with Forml state model updates and a reactive schema getter', async () => {
  const schema = shallowRef<FormSchema>(form)
  const session = useFormSession(() => schema.value)
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp({
    render: () =>
      h(Forml, {
        schema: session.value.schema,
        state: session.value.state,
        'onUpdate:state': (state: FormState) => {
          session.value.state = state
        },
      }),
  })
  app.mount(root)
  try {
    const input = root.querySelector<HTMLInputElement>('input[name="name"]')!
    input.value = 'Ada'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.waitFor(() => expect(session.value.state.answers.name).toBe('Ada'))
    root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(session.value.state.stepId).toBe('contact'))

    schema.value = JSON.parse(JSON.stringify(form))
    await nextTick()
    expect(session.value.state.stepId).toBe('contact')
    expect(session.value.state.answers.name).toBe('Ada')

    schema.value = { steps: [{ ...form.steps[0], title: 'New preferences' }] }
    await nextTick()
    expect(session.value.state.stepId).toBe('preferences')
    expect(session.value.state.answers.name).toBeUndefined()
    expect(root.querySelector<HTMLInputElement>('input[name="name"]')!.value).toBe('')
  } finally {
    app.unmount()
    root.remove()
  }
})
