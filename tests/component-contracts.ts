import type { Component } from 'vue'
import {
  ChoiceQuestion, DefaultStep, defineProgressComponent, defineQuestionComponents, defineStepComponents, FormlType,
} from '../src'
import type { ProgressComponentProps, QuestionComponentProps, StepComponentProps, StepComponentSlots } from '../src'
import Progress from '../src/components/FormlProgress.vue'

declare const missingAnswer: Component & (new () => { $props: QuestionComponentProps })
declare const invalidAnswer: Component & (new () => {
  $props: QuestionComponentProps & { onAnswer?: (value: Date) => void }
})
declare const missingDefaultSlot: Component & (new () => {
  $props: StepComponentProps
  $slots: { header: () => unknown }
})
declare const requiredExtraProp: Component & (new () => {
  $props: StepComponentProps & { heading: string }
  $slots: StepComponentSlots
})
declare const wrongStepIndex: Component & (new () => {
  $props: Omit<ProgressComponentProps, 'stepIndex'> & { stepIndex: string }
})

defineQuestionComponents({ [FormlType.Radio]: ChoiceQuestion })
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
