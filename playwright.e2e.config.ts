import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/e2e",
	timeout: 120_000,
	use: {
		browserName: "chromium",
		colorScheme: "dark",
		viewport: { height: 900, width: 1440 },
	},
});
