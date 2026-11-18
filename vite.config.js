import { fileURLToPath, URL } from "node:url";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API_PORT = process.env.API_PORT || 3001;

// Frontend (React) em Vite. O backend Node.js (server/index.js) responde em /api e /uploads;
// em desenvolvimento o Vite repassa essas chamadas para ele (proxy).
export default defineConfig({
  plugins: [
    // Rotas baseadas em arquivos em src/routes — mesmo padrão de nomes do template base44 (TanStack).
    TanStackRouterVite({ target: "react", autoCodeSplitting: true, routesDirectory: "src/routes", generatedRouteTree: "src/routeTree.gen.ts" }),
    react(),
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 5173,
    proxy: {
      "/api": `http://localhost:${API_PORT}`,
      "/uploads": `http://localhost:${API_PORT}`,
    },
  },
  build: { outDir: "dist" },
});
