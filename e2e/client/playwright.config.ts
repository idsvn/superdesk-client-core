import {defineConfig, devices} from '@playwright/test';
import path from 'path';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
    testDir: './playwright',
    /* Run tests in files in parallel */
    fullyParallel: false,
    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: !!process.env.CI,
    /* Retry on CI only */
    retries: 0,
    /* Opt out of parallel tests on CI. */
    workers: process.env.CI ? 1 : undefined,
    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: 'html',
    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
        /* Base URL to use in actions like `await page.goto('/')`. */
        baseURL: 'http://localhost:9000',

        viewport: {width: 1280, height: 800},

        /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
        trace: 'retain-on-failure',

        screenshot: 'only-on-failure',
    },

    /* Configure projects for major browsers */
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                storageState: path.join(__dirname, './playwright/.auth/user.json'),
            },
        },

        // {
        //     name: 'firefox',
        //     use: {
        //         ...devices['Desktop Firefox'],
        //         storageState: 'playwright/.auth/user.json',
        //     },
        // },

        // {
        //     name: 'webkit',
        //     use: {
        //         ...devices['Desktop Safari'],
        //         storageState: 'playwright/.auth/user.json',
        //     },
        // },

        /* Test against mobile viewports. */
        // {
        //     name: 'Mobile Chrome',
        //     use: {
        //         ...devices['Pixel 5'],
        //         storageState: 'playwright/.auth/user.json',
        //     },
        // },
        // {
        //     name: 'Mobile Safari',
        //     use: {
        //         ...devices['iPhone 12'],
        //         storageState: 'playwright/.auth/user.json',
        //     },
        // },

        /* Test against branded browsers. */
        // {
        //     name: 'Microsoft Edge',
        //     use: {
        //         ...devices['Desktop Edge'],
        //         storageState: 'playwright/.auth/user.json',
        //         channel: 'msedge',
        //     },
        // },
        // {
        //     name: 'Google Chrome',
        //     use: {
        //         ...devices['Desktop Chrome'],
        //         storageState: 'playwright/.auth/user.json',
        //         channel: 'chrome',
        //     },
        // },
    ],

    /* Run your local dev server before starting the tests */
    // webServer: {
    //   command: 'npm run start',
    //   url: 'http://127.0.0.1:3000',
    //   reuseExistingServer: !process.env.CI,
    // },
});
