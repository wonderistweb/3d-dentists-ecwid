import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/main.js',
      name: 'DentistsEcwid3D',
      formats: ['iife'],
      fileName: () => 'ecwid-custom.js',
    },
    outDir: 'dist',
    minify: true,
  },
});
