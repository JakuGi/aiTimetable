/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // 3000 = the default Site URL of a new Supabase project, so e-mail links work out of the box
  server: { port: 3000 },
  preview: { port: 3000 },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'Rozvrh – plánovač času',
        short_name: 'Rozvrh',
        description: 'Týždenný rozvrh, úlohy a návrhy, kedy čo robiť.',
        lang: 'sk',
        theme_color: '#2B4BDB',
        background_color: '#F7F9FC',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Supabase traffic always goes to the network
        navigateFallbackDenylist: [/^\/auth\//],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
