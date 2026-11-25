import type { StorybookConfig } from '@storybook/vue3-vite'

const config = {
  stories: ['./stories/**/*.stories.ts'],
  framework: '@storybook/vue3-vite',
} satisfies StorybookConfig

export default config
