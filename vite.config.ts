import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `SINGLEFILE=1 vite build` produces one self-contained index.html (used for previews).
export default defineConfig({
  // Relative asset paths: works at username.github.io/<repo>/ or any other host without changes.
  base: './',
  plugins: [react(), tailwindcss(), ...(process.env.SINGLEFILE ? [viteSingleFile()] : [])],
  worker: { format: 'es' },
  build: { target: 'es2020', chunkSizeWarningLimit: 3000 },
});
