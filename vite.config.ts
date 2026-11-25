import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

import tsconfig from './tsconfig.json'

export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  resolve: {
    alias: Object.entries(tsconfig.compilerOptions.paths).map(([name, [source]]) => ({
      find: new RegExp(`^${name}$`),
      replacement: fileURLToPath(new URL(source, import.meta.url)),
    })),
  },
  build:
    mode === 'library'
      ? {
          lib: {
            entry: 'src/index.ts',
            formats: ['es'],
            fileName: 'forml',
          },
          rollupOptions: { external: ['vue', 'effect'] },
        }
      : undefined,
}))
