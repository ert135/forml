import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { defineQuestionComponents, Forml, type FormAnswers, type FormConfig, type FormSchema } from 'forml'
import { ref } from 'vue'

import { questionValidators } from '../../demo/questionValidators'
import RemovalsInput from '../demoComponents/RemovalsInput.vue'

const questionComponents = defineQuestionComponents({ date: RemovalsInput, tel: RemovalsInput })
const schema = {
  steps: [
    {
      id: 'contact',
      title: 'Custom question types',
      questions: [
        {
          id: 'date',
          type: 'date',
          label: 'Preferred contact date',
          description: 'Choose a date on or after 1 January 2030.',
          required: true,
          props: { min: '2030-01-01' },
        },
        {
          id: 'phone',
          type: 'tel',
          label: 'Phone number',
          placeholder: 'e.g. 07700 900123',
          required: true,
          props: { minDigits: 7 },
        },
      ],
    },
  ],
} as const satisfies FormConfig<'date' | 'tel'>

const meta = {
  title: 'forml/Custom question types',
  args: { schema },
  render: (args) => ({
    components: { Forml },
    setup() {
      const submitted = ref<FormAnswers>()
      const onSubmit = (result: { request: FormAnswers }) => {
        submitted.value = result.request
      }
      return { args, questionComponents, questionValidators, submitted, onSubmit }
    },
    template: `
      <Forml v-bind="args" :question-components="questionComponents" :question-validators="questionValidators" @submit="onSubmit" />
      <div v-if="submitted" class="request">
        <h2>Submitted answers</h2>
        <pre>{{ JSON.stringify(submitted, null, 2) }}</pre>
      </div>
    `,
  }),
} satisfies Meta<{ schema: FormSchema }>

export default meta
type Story = StoryObj<typeof meta>

export const Contact: Story = {}
