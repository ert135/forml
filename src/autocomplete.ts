import { computed, nextTick, ref, shallowRef } from 'vue'

import type { ChoiceOption, FormQuestion, JsonValue } from './schema'

export type AutocompleteValue = ChoiceOption['value'] | null

export interface AutocompleteProps {
  readonly question: FormQuestion
  readonly value?: JsonValue
  readonly inputId: string
}

interface AutocompleteState {
  readonly question: FormQuestion
  readonly value?: JsonValue
  readonly open: boolean
  readonly query?: string
  readonly activeValue?: ChoiceOption['value']
}

type AutocompleteAction =
  | { readonly type: 'open' | 'close' }
  | { readonly type: 'search'; readonly query: string }
  | { readonly type: 'move'; readonly direction: 1 | -1 }
  | { readonly type: 'highlight'; readonly value: ChoiceOption['value'] }

function matchingOptions(state: AutocompleteState) {
  const search = state.query?.trim().toLocaleLowerCase() ?? ''
  return (state.question.options ?? []).filter((option) => option.label.toLocaleLowerCase().includes(search))
}

function reconcileState(previous: AutocompleteState | undefined, question: FormQuestion, value: JsonValue | undefined): AutocompleteState {
  if (!previous || previous.question !== question || (value != null && previous.value !== value)) {
    return { question, value, open: false }
  }
  // Clearing an answer while searching preserves the draft. Missing options cannot stay highlighted.
  const activeValue = matchingOptions(previous).some((option) => option.value === previous.activeValue) ? previous.activeValue : undefined
  return { ...previous, value, activeValue }
}

function reduceAutocomplete(state: AutocompleteState, action: AutocompleteAction): AutocompleteState {
  switch (action.type) {
    case 'open':
      return state.open ? state : { ...state, open: true, activeValue: matchingOptions(state).find((option) => option.value === state.value)?.value }
    case 'close':
      return { ...state, open: false, query: undefined, activeValue: undefined }
    case 'search':
      return { ...state, open: true, query: action.query, activeValue: undefined }
    case 'highlight':
      return { ...state, activeValue: action.value }
    case 'move': {
      const options = matchingOptions(state)
      const index = options.findIndex((option) => option.value === state.activeValue)
      const next = index < 0 ? (action.direction === 1 ? 0 : options.length - 1) : Math.max(0, Math.min(options.length - 1, index + action.direction))
      return { ...state, open: true, activeValue: options[next]?.value }
    }
  }
}

/** Share autocomplete behavior between question components. Pass reactive props and an answer emitter. */
export function useAutocomplete(props: AutocompleteProps, onAnswer: (value: AutocompleteValue) => void) {
  const input = ref<HTMLInputElement>()
  const list = ref<HTMLElement>()
  const interaction = shallowRef<AutocompleteState>()
  const snapshot = computed<{ interaction: AutocompleteState | undefined; state: AutocompleteState }>((previous) => ({
    interaction: interaction.value,
    // Consume each interaction once, so later prop changes cannot replay an old search.
    state: reconcileState(previous?.interaction === interaction.value ? previous?.state : interaction.value, props.question, props.value),
  }))
  const state = computed(() => snapshot.value.state)
  const open = computed(() => state.value.open)
  const selected = computed(() => props.question.options?.find((option) => option.value === props.value))
  const text = computed(() => state.value.query ?? selected.value?.label ?? '')
  const matches = computed(() => matchingOptions(state.value))
  const activeIndex = computed(() => (open.value ? matches.value.findIndex((option) => option.value === state.value.activeValue) : -1))
  const activeId = computed(() => (activeIndex.value >= 0 ? `${props.inputId}-option-${activeIndex.value}` : undefined))

  function update(action: AutocompleteAction) {
    interaction.value = reduceAutocomplete(state.value, action)
  }

  function show() {
    update({ type: 'open' })
  }

  function close() {
    update({ type: 'close' })
  }

  function search(event: Event) {
    update({ type: 'search', query: (event.target as HTMLInputElement).value })
    // Unconfirmed text is never an answer, and must not leave a stale selection.
    if (props.value != null) onAnswer(null)
  }

  function choose(option: ChoiceOption) {
    close()
    onAnswer(option.value)
  }

  function clear() {
    update({ type: 'search', query: '' })
    onAnswer(null)
    input.value?.focus()
  }

  function highlight(option: ChoiceOption) {
    update({ type: 'highlight', value: option.value })
  }

  function move(direction: 1 | -1) {
    update({ type: 'move', direction })
    void nextTick(() => {
      list.value?.children[activeIndex.value]?.scrollIntoView?.({ block: 'nearest' })
    })
  }

  function keydown(event: KeyboardEvent) {
    if (event.isComposing) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      move(event.key === 'ArrowDown' ? 1 : -1)
    } else if (event.key === 'Enter' && open.value) {
      event.preventDefault()
      const option = matches.value[activeIndex.value]
      if (option) choose(option)
    } else if (event.key === 'Escape' && open.value) {
      event.preventDefault()
      close()
    } else if (event.key === 'Tab') {
      close()
    }
  }

  return { input, list, open, selected, text, matches, activeIndex, activeId, show, close, search, choose, clear, highlight, move, keydown }
}
