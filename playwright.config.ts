import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/visual',
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.002,
    },
  },
  projects: [
    {
      name: 'desktop@1920',
      use: {
        browserName: 'chromium',
        colorScheme: 'dark',
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: 'desktop@1024',
      use: {
        browserName: 'chromium',
        colorScheme: 'dark',
        viewport: { width: 1024, height: 768 },
      },
    },
    {
      name: 'mobile@375',
      use: {
        browserName: 'chromium',
        colorScheme: 'dark',
        isMobile: true,
        viewport: { width: 375, height: 812 },
      },
    },
  ],
});
