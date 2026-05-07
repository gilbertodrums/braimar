import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// import fs from 'fs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',   // escucha en toda la red local
    port: 5173,
    allowedHosts: true, // Permitir acceso desde Cloudflare Tunnel
    // https: {
    //   key:  fs.readFileSync('./certs/192.168.1.76.nip.io+2-key.pem'),
    //   cert: fs.readFileSync('./certs/192.168.1.76.nip.io+2.pem'),
    // },
    proxy: {
      '/login':        'http://localhost:8081',
      '/change-pin':   'http://localhost:8081',
      '/bcv-rate':     'http://localhost:8081',
      '/colaboradores':'http://localhost:8081',
      '/enviar-recibo':'http://localhost:8081',
      '/pagos':        'http://localhost:8081',
      '/finanzas':     'http://localhost:8081',
      '/webauthn':     'http://localhost:8081',
    },
  },
})
