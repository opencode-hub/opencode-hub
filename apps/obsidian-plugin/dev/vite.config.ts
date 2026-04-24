import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      // Redirect `obsidian` imports to our mock
      obsidian: path.resolve(__dirname, "obsidian-mock.ts"),
    },
  },
  server: {
    port: 5199,
    open: true,
  },
});
