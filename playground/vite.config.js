import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue2";
import vux from "../src/index";

export default defineConfig({
  plugins: [
    vue(),
    vux({
      plugins: [
        // Theme variables for every less file, including vux's own.
        { name: "less-theme", path: "src/theme.less" },
        // vux's own `$t('cancel')` calls become literals at build time.
        { name: "i18n", vuxStaticReplace: true, vuxLocale: "zh-CN" },
      ],
    }),
  ],
});
