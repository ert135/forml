import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { Effect } from 'effect'
import { decodeForm } from 'forml/schema'

import Removals from '../../demo/App.vue'
import removals from '../../demo/removals.json'

const meta = {
  title: 'forml/Removals quote',
  component: Removals,
} satisfies Meta<typeof Removals>

export default meta

type Story = StoryObj<typeof meta>

export const Standard: Story = {}

export const Variant: Story = {
  args: {
    schema: Effect.runSync(
      decodeForm({
        steps: removals.steps.map((step) =>
          step.id === 'contact-details'
            ? {
                ...step,
                questions: step.questions.map((question) =>
                  question.id === 'phone' ? { ...question, label: 'Phone number for your removal quotes' } : question,
                ),
              }
            : step,
        ),
      }),
    ),
  },
}
