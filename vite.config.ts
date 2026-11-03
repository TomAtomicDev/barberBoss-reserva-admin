import { defineConfig } from "vite-plus";

export default defineConfig({
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
