import { defineConfig } from "vite"

export default defineConfig({
  server: {
    proxy: {
      // During `npm run dev`, forward /generate to the Express backend
      "/generate": "http://localhost:3000",
      "/health": "http://localhost:3000",
    },
  },
})
