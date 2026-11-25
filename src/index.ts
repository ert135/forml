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

export { defineProgressComponent, defineQuestionComponents, defineStepComponents } from './components/component-types'

export type {
  ProgressComponent,
  ProgressComponentProps,
  QuestionComponentEmits,
  QuestionComponentProps,
  QuestionComponents,
  StepComponentProps,
  StepComponentSlots,
  StepComponents,
} from './components/component-types'

export * from './errors'
export type { FormStepChangeEffect } from './step-change-effects'
export type { QuestionChangeContext, QuestionChangeEffect, QuestionChangeEffects } from './change-effects'

export { decodeForm, FormlType, loadForm } from './schema'

export type { AnswersFromSchema, ChoiceOption, FormAnswers, FormConfig, FormQuestion, FormSchema, FormStep, JsonValue, ShowWhen } from './schema'

export { createFormState, FormlActionType, reduceForm } from './state'

export type { FormAction, FormState } from './state'

export { createSubmission } from './submission'

export type { FormSubmission, SchemaSubmissionOptions, SubmissionOptions, SubmissionResult } from './submission'

export { validateAnswers } from './validation'
export type { QuestionValidationContext, QuestionValidator, QuestionValidators } from './validation'
