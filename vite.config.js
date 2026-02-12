import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig ({
    server: {
        port: 5175,
        strictPort: true,
        watch: { usePolling: true }
    },
    build: {
        rollupOptions: {
            input: {
                white: resolve(__dirname, "while.html"),
                hall: resolve(__dirname, "hall.html"),
            },
        },
    },
});