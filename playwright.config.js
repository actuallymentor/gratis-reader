import { defineConfig } from '@playwright/test'

export default defineConfig( {

    testDir: `./tests`,

    // Upload → parse → reader flows run close to 30s on a busy machine with two workers
    timeout: 60_000,
    expect: { timeout: 5_000 },

    // Every test gets its own context and seeded IndexedDB, so tests in one file can run side by side
    fullyParallel: true,
    retries: 0,
    // The shared dev server is the bottleneck: 4 workers measured only ~7% faster than 2 on 4 cores
    workers: process.env.PW_WORKERS ? Number( process.env.PW_WORKERS ) : 2,

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
