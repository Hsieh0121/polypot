import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  server: {
    port: 5175,
    strictPort: true,
    watch: { usePolling: true },
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        entry: resolve(__dirname, "entry.html"),
        white: resolve(__dirname, "white.html"),
        hall: resolve(__dirname, "hall.html"),
        print: resolve(__dirname, "print.html"),
        printAdmin: resolve(__dirname, "print-admin.html"),
      },
    },
  },
});