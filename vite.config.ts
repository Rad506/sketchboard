import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/sketchboard/',
  plugins: [
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'Sketchboard',
        short_name: 'Sketchboard',
        display: 'fullscreen',
        orientation: 'any',
        start_url: '/sketchboard/',
        scope: '/sketchboard/',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
