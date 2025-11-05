import path from "path";
import { defineConfig, mergeConfig } from "vite";
import { getBuildConfig, external, pluginHotRestart } from "./vite.base.config";

// https://vitejs.dev/config
export default defineConfig((env) => {
  const baseConfig = getBuildConfig(env);
  
  // 从 external 列表中移除 exif-parser,让 Vite 打包它
  const filteredExternal = external.filter((dep) => dep !== "exif-parser");
  
  return mergeConfig(baseConfig, {
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      rollupOptions: {
        external: filteredExternal,
        // 确保 CommonJS 模块被正确转换
        output: {
          format: "cjs",
        },
      },
      // 强制打包 exif-parser
      commonjsOptions: {
        include: [/node_modules/, /exif-parser/],
      },
    },
    // 优化依赖,确保 exif-parser 被处理
    optimizeDeps: {
      include: ["exif-parser"],
    },
    plugins: [pluginHotRestart("restart")],
  });
});
