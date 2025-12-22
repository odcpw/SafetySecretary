import { defineConfig, type Connect, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const tuiRewritePlugin = (): Plugin => ({
  name: "tui-rewrite",
  configureServer(server) {
    server.middlewares.use((req: Connect.IncomingMessage, _res, next) => {
      if (!req.url) {
        next();
        return;
      }
      const [pathname] = req.url.split("?");
      if (!pathname?.startsWith("/tui")) {
        next();
        return;
      }
      const isHtml = pathname.endsWith(".html");
      const hasExtension = /\.[a-zA-Z0-9]+$/.test(pathname);
      if (!isHtml && !hasExtension) {
        req.url = "/tui.html";
      }
      next();
    });
  }
});

export default defineConfig({
  plugins: [react(), tuiRewritePlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true
      }
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        tui: path.resolve(__dirname, "tui.html")
      }
    }
  }
});
