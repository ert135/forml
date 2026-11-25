<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import type { QuestionComponentEmits, QuestionComponentProps } from '../../src/components/component-types'
import type { ChoiceOption } from '../../src/schema'

const props = defineProps<QuestionComponentProps>()
const emit = defineEmits<QuestionComponentEmits<ChoiceOption['value'] | null>>()
const input = ref<HTMLInputElement>()
const list = ref<HTMLUListElement>()
const open = ref(false)
const query = ref<string>()
const activeIndex = ref(-1)
const selected = computed(() => props.question.options?.find((option) => option.value === props.value))
const text = computed(() => query.value ?? selected.value?.label ?? '')
const matches = computed(() => {
  const search = query.value?.trim().toLocaleLowerCase() ?? ''
  return (props.question.options ?? []).filter((option) => option.label.toLocaleLowerCase().includes(search))
})
const activeId = computed(() => (open.value && matches.value[activeIndex.value] ? `${props.inputId}-option-${activeIndex.value}` : undefined))

function show() {
  if (open.value) return
  open.value = true
  activeIndex.value = matches.value.findIndex((option) => option.value === props.value)
}

function close() {
  open.value = false
  query.value = undefined
  activeIndex.value = -1
}

watch(
  () => props.value,
  (value) => {
    // A null answer emitted while searching must not erase the user's query.
    if (value != null) close()
  },
)
watch(() => props.question, close)
watch(matches, () => {
  activeIndex.value = -1
})

function search(event: Event) {
  query.value = (event.target as HTMLInputElement).value
  open.value = true
  activeIndex.value = -1
  // Unconfirmed text is never an answer, and must not leave a stale selection.
  if (props.value != null) emit('answer', null)
}

function choose(option: ChoiceOption) {
  close()
  emit('answer', option.value)
}

function clear() {
  query.value = ''
  activeIndex.value = -1
  open.value = true
  emit('answer', null)
  input.value?.focus()
}

function move(direction: 1 | -1) {
  open.value = true
  const count = matches.value.length
  activeIndex.value =
    count === 0 ? -1 : activeIndex.value < 0 ? (direction === 1 ? 0 : count - 1) : Math.max(0, Math.min(count - 1, activeIndex.value + direction))
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
</script>

<template>
  <div class="forml-autocomplete">
    <label class="forml-label" :for="inputId">{{ question.label }}</label>
    <div class="forml-autocomplete-control">
      <input
        :id="inputId"
        ref="input"
        class="forml-autocomplete-input"
        type="text"
        role="combobox"
        autocomplete="off"
        aria-autocomplete="list"
        :name="question.id"
        :value="text"
        :placeholder="question.placeholder ?? 'Type to search…'"
        :required="question.required"
        :aria-expanded="open"
        :aria-controls="open ? `${inputId}-listbox` : undefined"
        :aria-activedescendant="activeId"
        :aria-describedby="describedBy"
        :aria-invalid="error ? true : undefined"
        @focus="show"
        @click="show"
        @input="search"
        @keydown="keydown"
        @blur="close"
      />
      <button
        v-if="selected || text"
        type="button"
        class="forml-autocomplete-clear"
        tabindex="-1"
        :aria-label="`Clear ${question.label}`"
        @pointerdown.prevent
        @click="clear"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
    <div v-if="open" class="forml-autocomplete-popup">
      <ul :id="`${inputId}-listbox`" ref="list" role="listbox" :aria-label="question.label">
        <li
          v-for="(option, index) in matches"
          :id="`${inputId}-option-${index}`"
          :key="index"
          role="option"
          :aria-selected="index === activeIndex"
          @pointerdown.prevent
          @pointermove="activeIndex = index"
          @click="choose(option)"
        >
          {{ option.label }}
        </li>
      </ul>
      <p v-if="!matches.length" role="status">No matching options.</p>
    </div>
  </div>
</template>

<style scoped>
.forml-autocomplete {
  position: relative;
}
.forml-autocomplete-control {
  position: relative;
}
.forml-autocomplete .forml-autocomplete-input {
  box-sizing: border-box;
  width: 100%;
  padding: 0.65rem 2.75rem 0.65rem 0.65rem;
  border: 1px solid #879d8f;
  border-radius: 0.4rem;
  font: inherit;
}
.forml-autocomplete .forml-autocomplete-input:focus-visible {
  outline: 2px solid #155e47;
  outline-offset: 2px;
}
.forml-autocomplete .forml-autocomplete-input[aria-invalid='true'] {
  border-color: #9c271b;
}
.forml-autocomplete .forml-autocomplete-clear {
  position: absolute;
  inset-inline-end: 0.2rem;
  top: 50%;
  transform: translateY(-50%);
  min-width: 2rem;
  min-height: 2rem;
  padding: 0.2rem;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.forml-autocomplete-popup {
  position: absolute;
  z-index: 10;
  inset-inline: 0;
  margin-top: 0.25rem;
  border: 1px solid #879d8f;
  border-radius: 0.4rem;
  background: #fff;
  color: #1d2925;
  box-shadow: 0 0.5rem 1rem rgb(0 0 0 / 10%);
}
.forml-autocomplete-popup ul {
  max-height: 14rem;
  overflow-y: auto;
  margin: 0;
  padding: 0.25rem;
  list-style: none;
}
.forml-autocomplete-popup li {
  padding: 0.55rem 0.65rem;
  border-radius: 0.2rem;
  cursor: pointer;
  overflow-wrap: anywhere;
}
.forml-autocomplete-popup li[aria-selected='true'] {
  background: #e7f2eb;
  outline: 2px solid #155e47;
  outline-offset: -2px;
}
.forml-autocomplete-popup p {
  margin: 0;
  padding: 0.65rem;
}
</style>
