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

        // Check redirection to onboarding/select
        await page.waitForURL("**/onboarding/select");
        await page.waitForLoadState("networkidle");

        // ----------------------------------------------------
        // 2. ONBOARDING: SELECT
        // ----------------------------------------------------
        // Target the first button inside the grid cards (which is the "Create" button)
        await page.locator(".grid button").first().click();

        // Check redirection to onboarding/create-family
        await page.waitForURL("**/onboarding/create-family");
        await page.waitForLoadState("networkidle");

        // ----------------------------------------------------
        // 3. ONBOARDING: CREATE FAMILY
        // ----------------------------------------------------
        await page.fill("#name", testFamilyName);

        // Submit the form
        await page.click('button[type="submit"]');

        // Check redirection to onboarding/invite
        await page.waitForURL("**/onboarding/invite");
        await page.waitForLoadState("networkidle");

        // ----------------------------------------------------
        // 4. ONBOARDING: INVITE (SKIP)
        // ----------------------------------------------------
        // Click the skip/continue button. We target the button inside the form that has type="button"
        // to avoid colliding with stepper buttons.
        await page.locator('form button[type="button"]').click();

        // Check redirection to home page
        await page.waitForURL("**/");
        await page.waitForLoadState("networkidle");

        // Wait for the sidebar and user avatar to appear
        const userMenuButton = page.getByRole("button", {name: testUsername});
        await expect(userMenuButton).toBeVisible();

        // ----------------------------------------------------
        // 5. LOGOUT
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
        // 6. LOGIN
        // ----------------------------------------------------
        await page.fill("#email", testEmail);
        await page.fill("#password", testPassword);
        await page.click('button[type="submit"]');

        // Check redirection back to home page
        await page.waitForURL("**/");
        await page.waitForLoadState("networkidle");

        // Verify we are logged in again
        await expect(page.getByRole("button", {name: testUsername})).toBeVisible();
    });
});
