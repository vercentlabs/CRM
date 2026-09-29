import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { API_URL } from '../playwright.config';
import { ADMIN_EMAIL, ADMIN_PASSWORD } from './global-setup';

const SALES_EMAIL = 'e2e-sales@example.test';
const SALES_PASSWORD = 'E2eSalesPass123';
const stamp = Date.now().toString(36);

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe.serial('CRM critical paths', () => {
  test.beforeAll(async ({ request }) => {
    // Admin adds a Sales member to the organization it signs in to (Alpha, its first).
    const login = await request.post(`${API_URL}/api/v1/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, client: 'mobile' },
    });
    expect(login.ok()).toBeTruthy();
    const { accessToken } = (await login.json()).data;
    const created = await request.post(`${API_URL}/api/v1/organization/members`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        full_name: 'Sam Sales',
        email: SALES_EMAIL,
        password: SALES_PASSWORD,
        roleKey: 'sales',
      },
    });
    expect([201, 409]).toContain(created.status());
  });

  test('admin signs in, sees the dashboard, and the shell passes axe', async ({ page }) => {
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await expect(page.getByRole('heading', { name: /Hello, Erin/ })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Members' }),
    ).toBeVisible();
    const results = await new AxeBuilder({ page }).disableRules(['region']).analyze();
    expect(results.violations.map((v) => `${v.id} (${v.nodes.length})`)).toEqual([]);
  });

  test('creates a lead, edits it and assigns it', async ({ page }) => {
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/leads');
    await page.getByRole('button', { name: 'New lead' }).first().click();
    const sheet = page.getByRole('dialog', { name: 'New lead' });
    await sheet.getByLabel(/Full name/).fill(`E2E Lead ${stamp}`);
    await sheet.getByLabel(/Mobile number/).fill('9123456780');
    await sheet.getByRole('button', { name: 'Create lead' }).click();
    await expect(page).toHaveURL(/\/leads\/\d+$/);
    await expect(
      page.getByRole('heading', { name: new RegExp(`E2E Lead ${stamp}`) }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Edit' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit lead' });
    await edit.getByLabel(/Occupation/).fill('Engineer');
    await edit.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Engineer')).toBeVisible();

    await page.getByRole('button', { name: 'Assign', exact: true }).click();
    const assign = page.getByRole('dialog', { name: 'Assign lead' });
    await assign.getByLabel('Assigned to').selectOption({ label: 'Sam Sales' });
    await assign.getByRole('button', { name: 'Assign' }).click();
    await expect(page.getByRole('main').getByText('Sam Sales')).toBeVisible();
  });

  test('creates an opportunity for the lead', async ({ page }) => {
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/leads?search=${encodeURIComponent(`E2E Lead ${stamp}`)}`);
    await page.getByRole('link', { name: `E2E Lead ${stamp}` }).click();
    await page.getByRole('button', { name: 'New opportunity' }).click();
    const sheet = page.getByRole('dialog', { name: 'New opportunity' });
    await sheet.getByLabel(/Title/).fill(`Gold plan ${stamp}`);
    await sheet.getByLabel(/^Value/).fill('25000');
    await sheet.getByRole('button', { name: 'Create opportunity' }).click();
    await expect(page.getByRole('link', { name: `Gold plan ${stamp}` })).toBeVisible();
  });

  test('a Sales member cannot see or open member management', async ({ page }) => {
    await signIn(page, SALES_EMAIL, SALES_PASSWORD);
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Leads' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Members' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Settings' })).toHaveCount(0);
    await page.goto('/settings/members');
    await expect(page.getByText("You don't have access to this")).toBeVisible();
    // The assigned lead is visible in the Sales member's own scope.
    await page.goto('/leads');
    await expect(page.getByRole('link', { name: `E2E Lead ${stamp}` })).toBeVisible();
  });

  test('admin manages an outbound webhook; the secret is shown exactly once', async ({ page }) => {
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/settings?tab=webhooks');
    const form = page.getByRole('form', { name: 'Add webhook' });
    await form.getByLabel('Endpoint URL').fill(`https://example.com/crm-e2e-${stamp}`);
    await form.getByLabel('lead.created').check();
    await form.getByRole('button', { name: 'Add webhook' }).click();
    const dialog = page.getByRole('dialog', { name: 'Signing secret' });
    await expect(dialog.getByTestId('webhook-secret')).toHaveText(/^whsec_/);
    await dialog.getByRole('button', { name: 'Done' }).click();
    const list = page.getByRole('list', { name: 'Webhook endpoints' });
    await expect(list.getByText(`https://example.com/crm-e2e-${stamp}`)).toBeVisible();
    await expect(page.getByTestId('webhook-secret')).toHaveCount(0);
    // After a reload the secret is never shown again.
    await page.reload();
    await expect(page.getByText(/whsec_/)).toHaveCount(0);
    await list.getByRole('button', { name: 'Disable' }).click();
    await expect(list.getByText('Disabled')).toBeVisible();
    await list.getByRole('button', { name: 'Delete' }).click();
    await page
      .getByRole('dialog', { name: 'Delete webhook?' })
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(page.getByText('No webhooks yet')).toBeVisible();
  });

  test('a Sales member has no webhook settings and sees their notifications menu', async ({
    page,
  }) => {
    await signIn(page, SALES_EMAIL, SALES_PASSWORD);
    await page.goto('/settings?tab=webhooks');
    await expect(page.getByText("You don't have access to this")).toBeVisible();
    await page.getByRole('button', { name: /^Notifications/ }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('switching organization leaves no data from the previous one', async ({ page }) => {
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/leads');
    await expect(page.getByRole('link', { name: `E2E Lead ${stamp}` })).toBeVisible();
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Switch to Beta E2E' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('complementary').getByText('Beta E2E')).toBeVisible();
    await page.goto('/leads');
    await expect(page.getByText('No leads yet')).toBeVisible();
    await expect(page.getByRole('link', { name: `E2E Lead ${stamp}` })).toHaveCount(0);
  });

  test('signs out', async ({ page }) => {
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/leads');
    await expect(page).toHaveURL(/\/login\?next=/);
  });
});
