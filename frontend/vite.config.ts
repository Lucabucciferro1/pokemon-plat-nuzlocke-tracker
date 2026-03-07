import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// If your backend runs on a different port sometimes, update target.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:5091",
    },
  },
});