import { defineConfig } from "vite";

// 文档站：把根目录 index.html + src/ 演示打包为静态站点，供 GitHub Pages 部署。
// base 用相对路径，保证部署在 /<repo>/ 子路径下资源也能正确加载。
export default defineConfig({
  base: "./",
  esbuild: {
    jsx: "automatic",
  },
  build: {
    outDir: "docs-dist",
    emptyOutDir: true,
  },
});
