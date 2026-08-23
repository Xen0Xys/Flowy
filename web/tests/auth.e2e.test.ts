import {expect, test} from "@playwright/test";

test.describe("Authentication and Onboarding Flow", () => {
    // Generate unique credentials for each test run to prevent state collision
    const randomId = Math.random().toString(36).substring(2, 10);
    const testUsername = `User_${randomId}`;
    const testEmail = `test_${randomId}@example.com`;
    const testPassword = "Password123!ThisIsLongEnough";
    const testFamilyName = `Family_${randomId}`;

    test("should successfully register, complete onboarding, logout, and login", async ({page}) => {
        // ----------------------------------------------------
        // 1. REGISTER
        // ----------------------------------------------------
        await page.goto("/auth/register");

        // Wait for Nuxt hydration to complete so Vue events (@submit.prevent) are attached
        await page.waitForLoadState("networkidle");

        await page.fill("#username", testUsername);
        await page.fill("#email", testEmail);
        await page.fill("#password", testPassword);

        await page.click('button[type="submit"]');

        // ----------------------------------------------------
        // 2. ONBOARDING: WELCOME
        // ----------------------------------------------------
        await page.waitForURL(/\/onboarding\/?$/);
        await page.waitForLoadState("networkidle");

        // Click "Get started" - the last visible primary CTA on the welcome card
        await page.locator('main button:has-text("Commencer"), main button:has-text("Get started")').first().click();

        // ----------------------------------------------------
        // 3. ONBOARDING: SELECT
        // ----------------------------------------------------
        await page.waitForURL("**/onboarding/select");
        await page.waitForLoadState("networkidle");

        // Target the first button inside the grid cards (which is the "Create" button)
        await page.locator(".grid button").first().click();

        // ----------------------------------------------------
        // 4. ONBOARDING: CREATE FAMILY
        // ----------------------------------------------------
        await page.waitForURL("**/onboarding/create-family");
        await page.waitForLoadState("networkidle");

        await page.fill("#name", testFamilyName);
        await page.click('button[type="submit"]');

        // ----------------------------------------------------
        // 5. ONBOARDING: CATEGORIES
        // ----------------------------------------------------
        await page.waitForURL("**/onboarding/categories");
        await page.waitForLoadState("networkidle");

        // Click continue with default selection
        await page.locator('button:has-text("Continuer"), button:has-text("Continue")').first().click();

        // ----------------------------------------------------
        // 6. ONBOARDING: INVITE (SKIP)
        // ----------------------------------------------------
        await page.waitForURL("**/onboarding/invite");
        await page.waitForLoadState("networkidle");

        // Skip: nothing entered, click the "Skip"/"Passer" button
        await page.locator('button:has-text("Passer"), button:has-text("Skip")').first().click();

        // Check redirection to home page
        await page.waitForURL(/\/$/);
        await page.waitForLoadState("networkidle");

        // Wait for the sidebar and user avatar to appear
        const userMenuButton = page.getByRole("button", {name: testUsername});
        await expect(userMenuButton).toBeVisible();

        // ----------------------------------------------------
        // 7. LOGOUT
        // ----------------------------------------------------
        // Open user dropdown menu
        await userMenuButton.click();

        // Click the logout item in the dropdown.
        // The menu item contains the logout icon and/or logout text.
        await page
            .locator(
                '[role="menuitem"]:has(svg), [role="menuitem"]:has-text("Log out"), [role="menuitem"]:has-text("déconnecter")',
            )
            .last()
            .click();

        // Check redirection to login page
        await page.waitForURL("**/auth/login");
        await page.waitForLoadState("networkidle");

        // ----------------------------------------------------
        // 8. LOGIN
        // ----------------------------------------------------
        await page.fill("#email", testEmail);
        await page.fill("#password", testPassword);
        await page.click('button[type="submit"]');

        // Check redirection back to home page
        await page.waitForURL(/\/$/);
        await page.waitForLoadState("networkidle");

        // Verify we are logged in again
        await expect(page.getByRole("button", {name: testUsername})).toBeVisible();
    });
});
