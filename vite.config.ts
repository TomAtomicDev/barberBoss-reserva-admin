import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/barberBoss-reserva-admin/" : "/",
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    clearMocks: true,
  },
  staged: {
    "*": "vp check --fix --no-error-on-unmatched-pattern",
  },
  fmt: {
    ignorePatterns: [".agents/skills/**", "README.md", "skills-lock.json", "vite.config.ts"],
  },
  lint: {
    ignorePatterns: [".agents/skills/**", "README.md", "skills-lock.json", "vite.config.ts"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
});
