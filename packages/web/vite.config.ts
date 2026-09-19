import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ plugins: [vue(), tailwindcss()], server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': { target: `http://127.0.0.1:${process.env.NEXUS_PORT || 4310}`, changeOrigin: true } } }, build: { sourcemap: false } });
