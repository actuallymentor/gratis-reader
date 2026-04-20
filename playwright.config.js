import { defineConfig } from '@playwright/test'

export default defineConfig( {

    testDir: `./tests`,

    timeout: 30_000,
    expect: { timeout: 5_000 },

    fullyParallel: false,
    retries: 0,
    workers: 1,

    reporter: `list`,

    use: {
        baseURL: `http://localhost:5173`,
        headless: true,
        screenshot: `only-on-failure`,
        trace: `retain-on-failure`,
    },

    webServer: {
        command: `npm run dev`,
        url: `http://localhost:5173`,
        reuseExistingServer: true,
        timeout: 30_000,
    },

} )
