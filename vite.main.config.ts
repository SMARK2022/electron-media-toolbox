import path from "path";
import { defineConfig, mergeConfig } from "vite";
import { getBuildConfig, external, pluginHotRestart } from "./vite.base.config";

// https://vitejs.dev/config
export default defineConfig((env) => {
  const baseConfig = getBuildConfig(env);

  return mergeConfig(baseConfig, {
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      rollupOptions: {
        external: external,
        output: {
          format: "cjs",
        },
      },
    },
    plugins: [pluginHotRestart("restart")],
  });
});
