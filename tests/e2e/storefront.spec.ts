import { expect, test } from '@playwright/test';

const E2E_ADMIN_TEST_TOKEN =
  process.env.E2E_ADMIN_TEST_TOKEN || 'e2e-test-admin-secret-token-2026';

function persianToAsciiDigits(raw: string): string {
  const map: Record<string, string> = {
    '۰': '0',
    '۱': '1',
    '۲': '2',
    '۳': '3',
    '۴': '4',
    '۵': '5',
    '۶': '6',
    '۷': '7',
    '۸': '8',
    '۹': '9',
  };
  return raw.replace(/[۰-۹]/g, (d) => map[d] || d);
}

test.describe('DentalMarket Storefront E2E Flows', () => {
  test('home -> Persian product search -> add to cart -> sandbox checkout -> order success page', async ({ page }) => {
    await page.goto('/');

    // Search via header search modal using a Persian query
    await page.getByTestId('header-search-button').click();
    const searchInput = page.getByTestId('header-search-input');
    await searchInput.fill('فایل روتاری');
    await searchInput.press('Enter');

    await expect(page).toHaveURL(/\/search\?q=/);
    const rotaryCard = page.getByTestId('product-card-prod_rotary_files');
    await expect(rotaryCard).toBeVisible();
    await rotaryCard.getByTestId('product-card-link').click();

    await expect(page).toHaveURL(/\/product\/dentsply-protaper-gold-files/);

    // Add to cart -> CartDrawer opens -> proceed to checkout
    await page.getByTestId('add-to-cart-button').click();
    await page.getByTestId('cart-drawer-checkout-link').click();

    await expect(page).toHaveURL(/\/checkout/);

    await page.getByTestId('checkout-name-input').fill('دکتر سارا کریمی');
    await page.getByTestId('checkout-mobile-input').fill('09123456789');
    await page.getByTestId('checkout-address-input').fill('تهران، خیابان شریعتی، نبش ظفر، پلاک ۱۸');

    await page.getByTestId('checkout-submit-button').click();

    // Sandbox online gateway verification modal appears -> complete verification
    const verifyBtn = page.getByTestId('sandbox-verify-payment-button');
    await expect(verifyBtn).toBeVisible();
    await verifyBtn.click();

    // Order success page shows paid state and order number
    await expect(page.getByTestId('order-success-card')).toBeVisible();
    await expect(page.getByTestId('order-success-number')).toContainText('DM-');
    await expect(page.getByTestId('order-success-status')).toContainText('پرداخت‌شده و آماده پردازش');
  });

  test('login via sandbox OTP -> create RFQ -> test admin quotes it -> user sees quote', async ({ page }) => {
    const mobile = '09124445566';

    // 1. Login via sandbox OTP on /account
    await page.goto('/account');
    await page.getByTestId('otp-mobile-input').fill(mobile);
    await page.getByTestId('otp-send-button').click();

    const hint = page.getByTestId('otp-sandbox-hint');
    await expect(hint).toBeVisible();
    const hintText = (await hint.textContent()) || '';
    const asciiDigitsMatch = persianToAsciiDigits(hintText).match(/\d{6}/);
    expect(asciiDigitsMatch).not.toBeNull();

    await page.getByTestId('otp-code-input').fill(asciiDigitsMatch![0]);
    await page.getByTestId('otp-verify-button').click();

    await expect(page.getByTestId('account-authenticated-header')).toBeVisible();

    // 2. Navigate to product and submit an RFQ
    await page.goto('/product/woodpecker-endo-radar-pro');
    await page.getByTestId('open-rfq-modal-button').click();

    await page.getByTestId('rfq-name-input').fill('دکتر بهرام نادری');
    await page.getByTestId('rfq-mobile-input').fill(mobile);
    await page.getByTestId('rfq-quantity-input').fill('3');
    await page.getByTestId('rfq-target-price-input').fill('36000000');
    await page.getByTestId('rfq-note-input').fill('درخواست پیش‌فاکتور کلینیکی برای ۳ دستگاه');

    const rfqResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/api/rfq') && res.request().method() === 'POST'
    );
    await page.getByTestId('rfq-submit-button').click();
    const rfqResponse = await rfqResponsePromise;
    expect(rfqResponse.status()).toBe(200);
    const rfqJson = (await rfqResponse.json()) as { ok: boolean; rfq: { id: string; rfqNo: string } };
    expect(rfqJson.ok).toBe(true);

    // 3. Test admin quotes the RFQ using the test-only E2E admin token
    const quoteRes = await page.request.post(`/api/rfq/${encodeURIComponent(rfqJson.rfq.id)}/quote`, {
      headers: {
        Authorization: `Bearer ${E2E_ADMIN_TEST_TOKEN}`,
      },
      data: {
        quotedUnitPrice: 37500000,
        validDays: 7,
        note: 'پیشنهاد رسمی با گارانتی ۱۸ ماهه و نصب رایگان',
      },
    });
    expect(quoteRes.status()).toBe(200);

    // 4. User returns to Account -> RFQ tab and sees the official quote
    await page.goto('/account');
    await expect(page.getByTestId('account-authenticated-header')).toBeVisible();
    await page.getByTestId('account-tab-rfqs').click();

    const rfqCard = page.getByTestId(`rfq-card-${rfqJson.rfq.id}`);
    await expect(rfqCard).toBeVisible();
    await expect(rfqCard).toContainText('قیمت اعلام‌شده');
    await expect(rfqCard).toContainText('۳۷٬۵۰۰٬۰۰۰');
  });
});
