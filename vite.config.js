import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'path';
export default defineConfig({
    plugins: [
        electron([
            {
                entry: 'electron/main.ts',
                onstart: function (options) {
                    options.startup();
                },
                vite: {
                    build: {
                        outDir: 'dist-electron',
                        sourcemap: true,
                    },
                },
            },
            {
                entry: 'electron/preload.ts',
                onstart: function (options) {
                    options.reload();
                },
                vite: {
                    build: {
                        outDir: 'dist-electron',
                        sourcemap: true,
                    },
                },
            },
        ]),
        renderer(),
    ],
    resolve: {
        alias: {
            '@core': path.resolve(__dirname, 'src/core'),
            '@scenes': path.resolve(__dirname, 'src/scenes'),
            '@entities': path.resolve(__dirname, 'src/entities'),
            '@systems': path.resolve(__dirname, 'src/systems'),
            '@ui': path.resolve(__dirname, 'src/ui'),
            '@assets': path.resolve(__dirname, 'src/assets'),
        },
    },
    build: {
        outDir: 'dist',
        sourcemap: true,
    },
});
