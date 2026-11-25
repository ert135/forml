import type { Component } from 'vue'

import RemovalsInput from '../.storybook/demoComponents/RemovalsInput.vue'
import {
  AutocompleteQuestion,
  ChoiceQuestion,
  DefaultStep,
  defineProgressComponent,
  defineQuestionComponents,
  defineStepComponents,
  FormlActionType,
  FormlType,
  type FormState,
  type FormStepChangeEffect,
  type ProgressComponentProps,
  type QuestionComponentProps,
  type QuestionValidators,
  type StepComponentProps,
  type StepComponentSlots,
} from '../src'
import Progress from '../src/components/FormlProgress.vue'

declare const missingAnswer: Component & (new () => { $props: QuestionComponentProps })
declare const invalidAnswer: Component &
  (new () => {
    $props: QuestionComponentProps & { onAnswer?: (value: Date) => void }
  })
declare const missingDefaultSlot: Component &
  (new () => {
    $props: StepComponentProps
    $slots: { header: () => unknown }
  })
declare const requiredExtraProp: Component &
  (new () => {
    $props: StepComponentProps & { heading: string }
    $slots: StepComponentSlots
  })
declare const wrongStepIndex: Component &
  (new () => {
    $props: Omit<ProgressComponentProps, 'stepIndex'> & { stepIndex: string }
  })

defineQuestionComponents({ [FormlType.Radio]: ChoiceQuestion })
defineQuestionComponents({ [FormlType.Autocomplete]: AutocompleteQuestion })
defineQuestionComponents({ date: RemovalsInput, tel: RemovalsInput })
defineStepComponents({ DefaultStep })
defineProgressComponent(Progress)

// @ts-expect-error Custom questions must declare their answer event.
defineQuestionComponents({ missingAnswer })
// @ts-expect-error Answer values must be JSON-compatible.
defineQuestionComponents({ invalidAnswer })
// @ts-expect-error Custom steps must render their questions through the default slot.
defineStepComponents({ missingDefaultSlot })
// @ts-expect-error Forml supplies only the documented step props.
defineStepComponents({ requiredExtraProp })
// @ts-expect-error The renderer passes a numeric step index.
defineProgressComponent(wrongStepIndex)

declare const beforeStepChange: FormStepChangeEffect
declare const state: FormState
beforeStepChange({ type: FormlActionType.Next }, state)
beforeStepChange({ type: FormlActionType.Back }, state)
// @ts-expect-error Answer changes do not navigate between steps.
beforeStepChange({ type: FormlActionType.Answer, questionId: 'name', value: 'Ada' }, state)
// @ts-expect-error Submit has its own pipeline and never reaches beforeStepChange.
beforeStepChange({ type: FormlActionType.Submit }, state)

const invalidValidators: QuestionValidators = {
  // @ts-expect-error Validation rules must return synchronously.
  async custom() {
    return 'Invalid.'
  },
  // @ts-expect-error Return a message or undefined, not a boolean.
  other: () => false,
}
