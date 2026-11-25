import { defineProgressComponent } from './components/component-types'
import Progress from './components/FormlProgress.vue'

export { default as Forml } from './components/Forml.vue'
export { default as AutocompleteQuestion } from '../.storybook/demoComponents/AutocompleteQuestion.vue'
export { default as CheckboxQuestion } from '../.storybook/demoComponents/CheckboxQuestion.vue'
export { default as ChoiceQuestion } from '../.storybook/demoComponents/ChoiceQuestion.vue'
export { default as DefaultStep } from '../.storybook/demoComponents/DefaultStep.vue'
export { default as SelectQuestion } from '../.storybook/demoComponents/SelectQuestion.vue'
export { default as TextQuestion } from '../.storybook/demoComponents/TextQuestion.vue'
export const FormlProgress = defineProgressComponent(Progress)

export { useAutocomplete } from './autocomplete'

export { defineProgressComponent, defineQuestionComponents, defineStepComponents } from './components/component-types'

export * from './errors'
export type * from './types'

export { decodeForm, FormlType, loadForm } from './schema'
export { sameJson } from './json'

export { createFormState, FormlActionType, reduceForm } from './state'

export { createSubmission } from './submission'

export { validateAnswers } from './validation'
