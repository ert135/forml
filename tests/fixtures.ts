import { FormlType, type FormConfig } from '../src'

export const form = {
  steps: [
    {
      id: 'preferences',
      title: 'Preferences',
      questions: [
        { id: 'name', type: FormlType.Text, label: 'Name', required: true },
        { id: 'newsletter', type: FormlType.Checkbox, label: 'Newsletter', defaultValue: false },
        {
          id: 'topics',
          type: FormlType.Multiselect,
          label: 'Topics',
          options: [
            { label: 'Work', value: 'work' },
            { label: 'Hobbies', value: 'hobbies' },
          ],
        },
      ],
    },
    {
      id: 'contact',
      title: 'Contact',
      questions: [
        { id: 'email', type: FormlType.Email, label: 'Email', required: true },
        {
          id: 'channel',
          type: FormlType.Radio,
          label: 'Channel',
          required: true,
          defaultValue: false,
          options: [
            { label: 'Email', value: false },
            { label: 'Phone', value: 0 },
          ],
        },
        {
          id: 'company',
          type: FormlType.Text,
          label: 'Company',
          required: true,
          showWhen: { newsletter: [true], topics: ['work'] },
        },
        {
          id: 'reference',
          type: FormlType.Text,
          label: 'Reference',
          required: true,
          showWhen: { company: ['Example Ltd'] },
        },
      ],
    },
  ],
} as const satisfies FormConfig
