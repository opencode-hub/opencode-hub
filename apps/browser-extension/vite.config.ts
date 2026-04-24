import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    crx({ manifest: manifest as any }),
  ],
  build: {
    rollupOptions: {
      input: {
        sidepanel: "src/sidepanel/index.html",
        options: "src/options/index.html",
      },
    },
  },
});
