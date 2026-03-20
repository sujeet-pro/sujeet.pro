import { resolve, } from 'path'
import { defineConfig, } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts',],
    exclude: ['node_modules', 'dist',],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src',),
    },
  },
},)
