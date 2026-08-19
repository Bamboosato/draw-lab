import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "pwa",
      filename: "sw.ts",
      injectRegister: false,
      registerType: "prompt",
      scope: "/",
      manifestFilename: "manifest.webmanifest",
      manifest: {
        id: "/",
        name: "DrawLab",
        short_name: "DrawLab",
        description: "トーナメント表を作成・保存するローカルアプリ",
        lang: "ja",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: "#e8eef7",
        background_color: "#f5f7fb",
        icons: [
          {
            src: "/draw-lab-icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/draw-lab-icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
      includeAssets: [
        "draw-lab-icon.png",
        "draw-lab-icon-180.png",
        "draw-lab-icon-192.png",
        "draw-lab-icon-512.png",
      ],
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
      },
    }),
  ],
});
