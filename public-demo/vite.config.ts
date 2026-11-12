import {defineConfig} from "vite";
export default defineConfig({esbuild:{jsx:"automatic"},build:{sourcemap:false},server:{host:"127.0.0.1",port:4173,strictPort:true}});
