import { defineConfig } from 'vite'

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  build: {
    // 库不需要把 public/ 的演示静态资源复制进 dist
    copyPublicDir: false,
    lib: {
      entry: {
        index: 'lib/index.ts',
        vue: 'lib/vue.ts',
        react: 'lib/react.tsx',
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: [
        'animejs',
        'vue',
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
      ],
    },
  },
})
