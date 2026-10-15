import { defineConfig, mergeConfig } from "vite";
import base from "./vite.config";
export default mergeConfig(base, defineConfig({build:{outDir:"dist-front",emptyOutDir:true,rollupOptions:{input:"front.html"}}}));
