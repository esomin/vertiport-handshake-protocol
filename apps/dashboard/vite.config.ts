import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite" // 추가
import path from "path"

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // 추가
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})