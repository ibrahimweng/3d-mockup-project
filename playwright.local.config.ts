import baseConfig from "./playwright.config";

export default {
  ...baseConfig,
  use: {
    ...baseConfig.use,
    launchOptions: {
      args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox"],
      executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    },
  },
};
