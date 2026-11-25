import type { StorybookConfig } from '@storybook/vue3-vite'

const config = {
  stories: ['./stories/**/*.stories.ts'],
  framework: {
    name: '@storybook/vue3-vite',
    options: { docgen: 'vue-component-meta' },
  },
} satisfies StorybookConfig

export default config
