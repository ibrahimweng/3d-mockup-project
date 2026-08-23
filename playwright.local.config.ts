import baseConfig from "./playwright.config";

/**
 * Local overrides for this container: no GPU, and Chromium lives outside the
 * npm cache. Untracked on purpose — it describes the machine, not the product.
 */
export default {
  ...baseConfig,
  use: {
    ...baseConfig.use,
    launchOptions: {
      args: [
        "--use-gl=swiftshader",
        "--enable-unsafe-swiftshader",
        "--disable-gpu-sandbox",
      ],
      executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    },
  },
};
