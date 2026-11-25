<script setup lang="ts">
import { useAutocomplete, type AutocompleteValue } from '../../src/autocomplete'
import type { QuestionComponentEmits, QuestionComponentProps } from '../../src/components/component-types'

const props = defineProps<QuestionComponentProps>()
const emit = defineEmits<QuestionComponentEmits<AutocompleteValue>>()
const { input, list, open, selected, text, matches, activeIndex, activeId, show, close, search, choose, clear, highlight, keydown } = useAutocomplete(
  props,
  (value) => emit('answer', value),
)
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
          @pointermove="highlight(option)"
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
