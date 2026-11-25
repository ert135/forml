import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { AutocompleteQuestion, FormlType, type JsonValue } from 'forml'
import { useArgs } from 'storybook/preview-api'

const meta = {
  title: 'forml/Autocomplete question',
  component: AutocompleteQuestion,
  args: {
    inputId: 'autocomplete-example',
    value: null,
    question: {
      id: 'city',
      type: FormlType.Autocomplete,
      label: 'City',
      placeholder: 'Search cities',
      required: true,
      options: [
        { label: 'Bristol', value: 'bristol' },
        { label: 'Cardiff', value: 'cardiff' },
        { label: 'Edinburgh', value: 'edinburgh' },
        { label: 'London', value: 'london' },
        { label: 'Manchester', value: 'manchester' },
      ],
    },
  },
  render: (args) => {
    const [, updateArgs] = useArgs()
    return {
      components: { AutocompleteQuestion },
      setup() {
        return { args, onAnswer: (value: JsonValue) => updateArgs({ value }) }
      },
      template: `
      <div class="forml">
        <AutocompleteQuestion v-bind="args" @answer="onAnswer" />
        <p v-if="args.error" :id="args.describedBy" class="forml-error">{{ args.error }}</p>
        <p>Selected value: <code>{{ JSON.stringify(args.value) ?? 'None' }}</code></p>
      </div>
    `,
    }
  },
} satisfies Meta<typeof AutocompleteQuestion>

export default meta
type Story = StoryObj<typeof meta>

export const Search: Story = {}
export const Selected: Story = { args: { value: 'cardiff' } }
export const Required: Story = {
  args: { error: 'City is required.', describedBy: 'autocomplete-example-error' },
}
export const TypedValues: Story = {
  args: {
    question: {
      id: 'choice',
      type: FormlType.Autocomplete,
      label: 'Choose a value',
      options: [
        { label: 'Zero (number)', value: 0 },
        { label: 'Zero (string)', value: '0' },
        { label: 'No (boolean)', value: false },
        { label: 'Empty string', value: '' },
      ],
    },
  },
}
