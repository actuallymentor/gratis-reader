import { defineConfig } from '@playwright/test'

export default defineConfig( {

    testDir: `./tests`,

    // Upload → parse → reader flows run close to 30s on a busy machine with two workers
    timeout: 60_000,
    expect: { timeout: 5_000 },

    fullyParallel: false,
    retries: 0,
    workers: 2,

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
