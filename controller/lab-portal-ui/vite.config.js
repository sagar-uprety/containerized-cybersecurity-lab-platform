import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig(({ command }) => ({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    base: command === 'build' ? '/static/dist/' : '/',
    build: {
        outDir: path.resolve(__dirname, '../lab-controller-api/app/static/dist'),
        emptyOutDir: true,
    },
    server: {
        port: 5173,
        proxy: {
            '/api': 'http://127.0.0.1:8000',
            '/terminal': 'http://127.0.0.1:8000',
            '/logout': 'http://127.0.0.1:8000',
            '/internal': 'http://127.0.0.1:8000',
        },
    },
}));
