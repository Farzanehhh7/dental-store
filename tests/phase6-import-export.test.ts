import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import firebaseConfig from '../firebase-applet-config.json';
import { createServerApp } from '../server';
import { createServerStore } from '../server/persistence';
import { createRepositories } from '../server/repositories';
import {
  commitImportService,
  exportTemplateService,
  rollbackImportJobService,
  validateImportRowsService,
} from '../server/services/importExportService';
import { buildCsvContent, sanitizeSpreadsheetCell } from '../src/lib/csv';
import {
  parseCsvToMatrix,
  parseXlsxBufferToMatrix,
  rowsToXlsxBuffer,
  streamCsvReadableToMatrix,
} from '../src/lib/excel';
import {
  IMPORT_TEMPLATE_LIST,
  IMPORT_TEMPLATE_REGISTRY,
  applyColumnMappingToMatrix,
  buildErrorReportRows,
  detectTemplateFromHeaders,
  validateMatrixWithTemplate,
  validateTemplateRows,
  type ImportCatalogContext,
  type ImportTemplateKey,
} from '../src/pages/admin/importExport';

function createFixtureContext(): ImportCatalogContext {
  const now = '2026-04-10T10:00:00.000Z';
  return {
    brands: [
      {
        id: 'brand_3m',
        slug: '3m',
        nameFa: 'تری‌ام (3M)',
        nameEn: '3M ESPE',
        countryCode: 'US',
        countryFa: 'آمریکا',
        descriptionFa: 'برند ترمیمی',
        isAuthorizedDealer: true,
        isActive: true,
        updatedAt: now,
      },
    ],
    categories: [
      {
        id: 'cat_rest',
        parentId: null,
        path: 'restorative',
        depth: 0,
        vertical: 'dental',
        nameFa: 'ترمیمی',
        nameEn: 'Restorative',
        slug: 'restorative',
        descriptionFa: 'مواد ترمیمی',
        seoTextFa: 'متن سئو دسته‌بندی مواد ترمیمی دندانپزشکی',
        isActive: true,
        showInMenu: true,
        showOnHome: true,
        sortOrder: 1,
        attributeIds: [],
        updatedAt: now,
      },
    ],
    products: [
      {
        id: 'prod_1',
        vertical: 'dental',
        sku: 'DM-COMP-01',
        imedCode: 'IMED-101',
        titleFa: 'کامپوزیت یونیورسال',
        titleEn: 'Universal Composite',
        slug: 'universal-composite',
        brandId: 'brand_3m',
        originCountryCode: 'US',
        originCountryFa: 'آمریکا',
        primaryCategoryId: 'cat_rest',
        categoryIds: ['cat_rest'],
        kind: 'consumable',
        status: 'active',
        pricingMode: 'fixed',
        shortDescriptionFa: 'کامپوزیت نانو',
        descriptionFa: 'توضیح کامل',
        imageUrl: '/img/c.jpg',
        galleryUrls: ['/img/c.jpg'],
        installationAvailable: false,
        trainingAvailable: false,
        minOrderQty: 1,
        ratingAvg: 4.8,
        ratingCount: 10,
        viewCount: 100,
        soldCount: 25,
        tags: [],
        attributes: {},
        variants: [
          {
            id: 'var_1_a2',
            sku: 'DM-COMP-01-A2',
            labelFa: 'شید A2',
            optionType: 'shade',
            optionValueFa: 'A2',
            colorHex: '#E8D8B8',
            basePrice: 2_000_000,
            groupPrices: { dentist: 1_850_000, clinic: 1_750_000 },
            stockOnHand: 40,
            reserved: 5,
            lowStockThreshold: 10,
            weightG: 45,
            isDefault: true,
            isActive: true,
          },
        ],
        publishedAt: now,
        updatedAt: now,
      },
    ],
    redirects: [
      {
        id: 'redir_1',
        fromPath: '/legacy-comp',
        toPath: '/product/universal-composite',
        statusCode: 301,
        hitCount: 4,
        createdAt: now,
      },
    ],
    warehouses: [
      {
        id: 'wh_teh',
        code: 'TEH-CENTRAL',
        nameFa: 'انبار مرکزی تهران',
        city: 'تهران',
        address: 'تهران',
        isActive: true,
        isDefault: true,
      },
      {
        id: 'wh_isf',
        code: 'ISF-HUB',
        nameFa: 'انبار اصفهان',
        city: 'اصفهان',
        address: 'اصفهان',
        isActive: true,
      },
    ],
    stockLevels: [
      {
        id: 'wh_teh__var_1_a2',
        productId: 'prod_1',
        variantId: 'var_1_a2',
        sku: 'DM-COMP-01-A2',
        warehouseId: 'wh_teh',
        warehouseCode: 'TEH-CENTRAL',
        onHand: 40,
        reserved: 5,
        lowStockThreshold: 10,
        updatedAt: now,
      },
    ],
  };
}

describe('Phase 6 — 7-Template Import/Export Validation, Security & Streaming', () => {
  it('loads exceljs lazily via dynamic import in src/lib/excel.ts', () => {
    const excelSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/excel.ts'), 'utf8');
    expect(excelSrc).not.toMatch(/^import\s+ExcelJS\s+from\s+['"]exceljs['"]/m);
    expect(excelSrc).toContain("import('exceljs')");
  });

  it('registers all 7 required templates', () => {
    expect(IMPORT_TEMPLATE_LIST.map((t) => t.key).sort()).toEqual([
      'brands',
      'categories',
      'prices',
      'products',
      'redirects',
      'stock',
      'variants',
    ]);
  });

  it('validates each of the 7 templates with valid/invalid fixtures, duplicates, and referential checks', () => {
    const ctx = createFixtureContext();

    // 1. products
    const prodRes = validateTemplateRows(
      'products',
      [
        {
          sku: 'dm-new-99',
          title_fa: 'باندينگ يونيورسال كلاس',
          title_en: 'Universal Bond',
          slug: 'universal-bond',
          brand_slug: '3m',
          category_slug: 'restorative',
          vertical: 'dental',
          kind: 'consumable',
          status: 'active',
          pricing_mode: 'fixed',
          base_price: '۱۵۰۰۰۰۰',
          stock_on_hand: '۱۲',
          imed_code: 'IM-99',
          short_description_fa: 'توضیح محصول',
        },
        {
          sku: 'DM-NEW-99', // duplicate in batch
          title_fa: 'تکراری',
          brand_slug: '3m',
          category_slug: 'restorative',
          base_price: '1200000',
        },
        {
          sku: 'DM-BAD-REF',
          title_fa: 'محصول با برند نامعتبر',
          brand_slug: 'unknown-brand',
          category_slug: 'unknown-cat',
          base_price: '-500',
        },
      ],
      ctx
    );
    expect(prodRes.rows[0].action).toBe('create');
    expect(prodRes.rows[0].normalized.title_fa).toBe('باندینگ یونیورسال کلاس');
    expect(prodRes.rows[0].normalized.base_price).toBe(1500000);
    expect(prodRes.rows[0].normalized.stock_on_hand).toBe(12);
    expect(prodRes.rows[1].action).toBe('error');
    expect(prodRes.rows[1].errors.some((e) => e.includes('تکراری'))).toBe(true);
    expect(prodRes.rows[2].action).toBe('error');
    expect(prodRes.rows[2].errors.some((e) => e.includes('برند'))).toBe(true);
    expect(prodRes.rows[2].errors.some((e) => e.includes('دسته‌بندی'))).toBe(true);

    // 2. variants
    const varRes = validateTemplateRows(
      'variants',
      [
        {
          product_sku: 'DM-COMP-01',
          variant_sku: 'DM-COMP-01-A3',
          label_fa: 'شید A3',
          option_type: 'shade',
          option_value_fa: 'A3',
          color_hex: '#DFCAA0',
          base_price: '۲۱۰۰۰۰۰',
          stock_on_hand: '15',
          low_stock_threshold: '5',
          weight_g: '45',
          is_active: 'بله',
        },
        {
          product_sku: 'MISSING-PROD',
          variant_sku: 'DM-X-1',
          label_fa: 'تست',
          base_price: '1000',
          color_hex: 'not-hex',
        },
      ],
      ctx
    );
    expect(varRes.rows[0].action).toBe('create');
    expect(varRes.rows[1].action).toBe('error');
    expect(varRes.rows[1].errors.some((e) => e.includes('MISSING-PROD'))).toBe(true);
    expect(varRes.rows[1].errors.some((e) => e.includes('#RRGGBB'))).toBe(true);

    // 3. prices
    const priceRes = validateTemplateRows(
      'prices',
      [
        {
          sku: 'DM-COMP-01-A2',
          base_price: '۲,۲۰۰,۰۰۰',
          dentist_price: '2050000',
          clinic_price: '1950000',
        },
        {
          sku: 'UNKNOWN-SKU',
          base_price: '0',
        },
      ],
      ctx
    );
    expect(priceRes.rows[0].action).toBe('update');
    expect(priceRes.rows[0].normalized.base_price).toBe(2200000);
    expect(priceRes.rows[1].action).toBe('error');

    // 4. stock (checks unknown SKU, unknown warehouse, and onHand < reserved = 5)
    const stockRes = validateTemplateRows(
      'stock',
      [
        {
          sku: 'DM-COMP-01-A2',
          warehouse_code: 'TEH-CENTRAL',
          stock_on_hand: '55',
          low_stock_threshold: '8',
          reason: 'شمارش انبار',
        },
        {
          sku: 'DM-COMP-01-A2',
          warehouse_code: 'TEH-CENTRAL', // duplicate composite key
          stock_on_hand: '60',
        },
        {
          sku: 'DM-COMP-01-A2',
          warehouse_code: 'NO-SUCH-WH',
          stock_on_hand: '10',
        },
      ],
      ctx
    );
    expect(stockRes.rows[0].action).toBe('update');
    expect(stockRes.rows[1].action).toBe('error');
    expect(stockRes.rows[2].action).toBe('error');

    const stockBelowReserved = validateTemplateRows(
      'stock',
      [{ sku: 'DM-COMP-01-A2', warehouse_code: 'TEH-CENTRAL', stock_on_hand: '3' }],
      ctx
    );
    expect(stockBelowReserved.rows[0].action).toBe('error');
    expect(stockBelowReserved.rows[0].errors[0]).toContain('رزرو');

    // 5. categories (parent created in batch row 1 can be referenced by row 2)
    const catRes = validateTemplateRows(
      'categories',
      [
        { slug: 'endo-new', name_fa: 'اندودانتیکس جدید', parent_slug: 'restorative', vertical: 'dental' },
        { slug: 'endo-files-sub', name_fa: 'فایل زیرمجموعه', parent_slug: 'endo-new', vertical: 'dental' },
        { slug: 'self-loop', name_fa: 'حلقه', parent_slug: 'self-loop' },
      ],
      ctx
    );
    expect(catRes.rows[0].action).toBe('create');
    expect(catRes.rows[1].action).toBe('create');
    expect(catRes.rows[2].action).toBe('error');

    // 6. brands
    const brandRes = validateTemplateRows(
      'brands',
      [
        { slug: 'ivoclar', name_fa: 'ایووکلار', country_code: 'LI', country_fa: 'لیختن‌اشتاین', is_authorized_dealer: 'true' },
        { slug: 'ivoclar', name_fa: 'تکراری', country_fa: 'سوئیس' },
      ],
      ctx
    );
    expect(brandRes.rows[0].action).toBe('create');
    expect(brandRes.rows[1].action).toBe('error');

    // 7. redirects
    const redirRes = validateTemplateRows(
      'redirects',
      [
        { from_path: '/old-page', to_path: '/new-page', status_code: '302' },
        { from_path: '/gone-page', to_path: '', status_code: '410' },
        { from_path: '/loop', to_path: '/loop', status_code: '301' },
      ],
      ctx
    );
    expect(redirRes.rows[0].action).toBe('create');
    expect(redirRes.rows[1].action).toBe('create');
    expect(redirRes.rows[2].action).toBe('error');
  });

  it('auto-detects templates from headers and applies custom column mapping', () => {
    const ctx = createFixtureContext();
    const matrix = [
      ['کد انبار', 'موجودی فیزیکی جدید', 'کد SKU تنوع/محصول'],
      ['ISF-HUB', '۲۵', 'DM-COMP-01-A2'],
    ];
    const detected = detectTemplateFromHeaders(matrix[0]);
    expect(detected.templateKey).toBe('stock');

    const mapped = applyColumnMappingToMatrix(matrix, IMPORT_TEMPLATE_REGISTRY.stock, detected.mapping);
    expect(mapped[0]).toMatchObject({
      sku: 'DM-COMP-01-A2',
      warehouse_code: 'ISF-HUB',
      stock_on_hand: '۲۵',
    });

    const dryRun = validateMatrixWithTemplate('stock', matrix, ctx, detected.mapping);
    expect(dryRun.summary.updateCount).toBe(1);
    expect(dryRun.summary.errorCount).toBe(0);

    const errReport = buildErrorReportRows(dryRun);
    expect(errReport).toHaveLength(0);
  });

  it('sanitizes spreadsheet formula injection (=, +, -, @, tab, CR) on CSV/XLSX exports and rejects formula cells on import', async () => {
    expect(sanitizeSpreadsheetCell('=CMD("calc")')).toBe('\'=CMD("calc")');
    expect(sanitizeSpreadsheetCell('+1+1')).toBe("'+1+1");
    expect(sanitizeSpreadsheetCell('-1+1')).toBe("'-1+1");
    expect(sanitizeSpreadsheetCell('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)");
    expect(sanitizeSpreadsheetCell('\t=1')).toBe("'\t=1");
    expect(sanitizeSpreadsheetCell(-15)).toBe(-15); // plain JS number stays numeric

    const csv = buildCsvContent(['title'], [['=SUM(A1:A5)'], ['+cmd|calc'], ['Normal Text']]);
    expect(csv).toContain('"\'=SUM(A1:A5)"');
    expect(csv).toContain('"\'+cmd|calc"');

    const xlsxBuf = await rowsToXlsxBuffer([{ sku: '=1+1', name: '@SUM(A1)' }], 'test');
    const matrix = await parseXlsxBufferToMatrix(xlsxBuf);
    expect(matrix[1][0].startsWith("'=")).toBe(true);
    expect(matrix[1][1].startsWith("'@")).toBe(true);

    const ctx = createFixtureContext();
    const badRes = validateTemplateRows(
      'brands',
      [{ slug: 'evil-brand', name_fa: '=HYPERLINK("http://evil")', country_fa: '@SUM(A1)' }],
      ctx
    );
    expect(badRes.rows[0].action).toBe('error');
    expect(badRes.rows[0].errors.some((e) => e.includes('فرمول'))).toBe(true);
  });

  it('enforces max file size (5MB) and max row count limits via streaming CSV reader and matrix parsers', async () => {
    const csvRows = ['slug,name_fa,country_fa'];
    for (let i = 0; i < 60; i += 1) {
      csvRows.push(`brand-${i},برند ${i},ایران`);
    }
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const bytes = new TextEncoder().encode(csvRows.join('\n'));
        // Feed in small chunks to exercise streaming state machine
        for (let off = 0; off < bytes.length; off += 64) {
          controller.enqueue(bytes.slice(off, off + 64));
        }
        controller.close();
      },
    });
    const parsedStream = await streamCsvReadableToMatrix(stream, { maxRows: 100 });
    expect(parsedStream).toHaveLength(61);

    await expect(
      streamCsvReadableToMatrix(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode(csvRows.join('\n')));
            c.close();
          },
        }),
        { maxRows: 10 }
      )
    ).rejects.toThrow(/سقف مجاز/);

    expect(() => parseCsvToMatrix(csvRows.join('\n'), { maxBytes: 200 })).toThrow(/سقف مجاز/);
  });
});

describe('Phase 6 — Repository Commits, Export/Import Round-Trips & Reversible Rollback', () => {
  it('round-trips export -> parse -> validate across all 7 templates with 0 errors and 100% skip', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dental-phase6-rt-'));
    try {
      const store = createServerStore(tmpDir);
      const repos = createRepositories(store);

      for (const tplKey of Object.keys(IMPORT_TEMPLATE_REGISTRY) as ImportTemplateKey[]) {
        const exported = await exportTemplateService(repos, tplKey);
        expect(exported.rows.length).toBeGreaterThan(0);

        const csv = buildCsvContent(
          exported.headers,
          exported.rows.map((r) => exported.headers.map((h) => r[h] ?? ''))
        );
        const matrix = parseCsvToMatrix(csv);
        const mapped = applyColumnMappingToMatrix(matrix, IMPORT_TEMPLATE_REGISTRY[tplKey]);
        const dryRun = await validateImportRowsService(repos, { templateKey: tplKey, rawRows: mapped });
        expect(dryRun.summary.errorCount, `Template ${tplKey} round-trip should have 0 errors`).toBe(0);
        expect(dryRun.summary.createCount, `Template ${tplKey} unchanged round-trip createCount`).toBe(0);
        expect(dryRun.summary.updateCount, `Template ${tplKey} unchanged round-trip updateCount`).toBe(0);
        expect(dryRun.summary.skipCount).toBe(exported.rows.length);
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 20000);

  it('commits, persists across store reload, and rolls back all 7 templates', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dental-phase6-repo-'));
    try {
      const store = createServerStore(tmpDir);
      const repos = createRepositories(store);

      const snap0 = await repos.catalog.getSnapshot();
      const firstBrandSlug = snap0.brands[0].slug;
      const firstCatSlug = snap0.categories[0].slug;
      const firstProd = snap0.products[0];
      const firstVar = firstProd.variants[0];

      // B. Brands commit (1 update + 1 create) & rollback
      const brandOriginalName = snap0.brands[0].nameFa;
      const brandCommit = await commitImportService(store, repos, {
        templateKey: 'brands',
        filename: 'brands.csv',
        actorUid: 'adm_1',
        actorEmail: 'adm@test.ir',
        rawRows: [
          {
            slug: firstBrandSlug,
            name_fa: 'نام ویرایش‌شده برند',
            country_code: snap0.brands[0].countryCode,
            country_fa: snap0.brands[0].countryFa,
          },
          {
            slug: 'phase6-brand-new',
            name_fa: 'برند جدید فاز ۶',
            country_code: 'CH',
            country_fa: 'سوئیس',
          },
        ],
      });
      expect(brandCommit.ok).toBe(true);
      if (!brandCommit.ok) return;
      expect(brandCommit.data.job.counts).toMatchObject({ createCount: 1, updateCount: 1, errorCount: 0 });

      let snapAfter = await repos.catalog.getSnapshot();
      expect(snapAfter.brands.find((b) => b.slug === firstBrandSlug)?.nameFa).toBe('نام ویرایش‌شده برند');
      expect(snapAfter.brands.some((b) => b.slug === 'phase6-brand-new')).toBe(true);

      const brandRb = await rollbackImportJobService(store, repos, {
        jobId: brandCommit.data.job.id,
        actorUid: 'adm_1',
        actorEmail: 'adm@test.ir',
      });
      expect(brandRb.ok).toBe(true);
      snapAfter = await repos.catalog.getSnapshot();
      expect(snapAfter.brands.find((b) => b.slug === firstBrandSlug)?.nameFa).toBe(brandOriginalName);
      expect(snapAfter.brands.some((b) => b.slug === 'phase6-brand-new')).toBe(false);

      // Idempotency: second rollback fails cleanly with 409
      const secondRb = await rollbackImportJobService(store, repos, {
        jobId: brandCommit.data.job.id,
        actorUid: 'adm_1',
        actorEmail: 'adm@test.ir',
      });
      expect(secondRb.ok).toBe(false);
      if (!secondRb.ok) expect(secondRb.status).toBe(409);

      // C. Categories commit & rollback
      const catCommit = await commitImportService(store, repos, {
        templateKey: 'categories',
        filename: 'cats.csv',
        actorUid: 'adm_1',
        actorEmail: 'adm@test.ir',
        rawRows: [{ slug: 'phase6-subcat', name_fa: 'زیردسته فاز ۶', parent_slug: firstCatSlug, vertical: 'dental' }],
      });
      expect(catCommit.ok).toBe(true);
      if (!catCommit.ok) return;
      expect((await repos.catalog.getSnapshot()).categories.some((c) => c.slug === 'phase6-subcat')).toBe(true);
      await rollbackImportJobService(store, repos, { jobId: catCommit.data.job.id, actorUid: 'adm_1', actorEmail: 'adm@test.ir' });
      expect((await repos.catalog.getSnapshot()).categories.some((c) => c.slug === 'phase6-subcat')).toBe(false);

      // D. Products commit & rollback
      const origProdTitle = firstProd.titleFa;
      const prodCommit = await commitImportService(store, repos, {
        templateKey: 'products',
        filename: 'prods.csv',
        actorUid: 'adm_1',
        actorEmail: 'adm@test.ir',
        rawRows: [
          {
            sku: firstProd.sku,
            title_fa: 'عنوان بروزشده محصول',
            brand_slug: firstBrandSlug,
            category_slug: firstCatSlug,
            base_price: firstVar.basePrice ?? 500000,
          },
          {
            sku: 'PHASE6-PROD-NEW',
            title_fa: 'محصول جدید ایمپورتی',
            brand_slug: firstBrandSlug,
            category_slug: firstCatSlug,
            base_price: 990000,
            stock_on_hand: 14,
          },
        ],
      });
      expect(prodCommit.ok).toBe(true);
      if (!prodCommit.ok) return;
      snapAfter = await repos.catalog.getSnapshot();
      expect(snapAfter.products.find((p) => p.id === firstProd.id)?.titleFa).toBe('عنوان بروزشده محصول');
      expect(snapAfter.products.some((p) => p.sku === 'PHASE6-PROD-NEW')).toBe(true);
      await rollbackImportJobService(store, repos, { jobId: prodCommit.data.job.id, actorUid: 'adm_1', actorEmail: 'adm@test.ir' });
      snapAfter = await repos.catalog.getSnapshot();
      expect(snapAfter.products.find((p) => p.id === firstProd.id)?.titleFa).toBe(origProdTitle);
      expect(snapAfter.products.some((p) => p.sku === 'PHASE6-PROD-NEW')).toBe(false);

      // E. Variants commit & rollback
      const varCommit = await commitImportService(store, repos, {
        templateKey: 'variants',
        filename: 'variants.csv',
        actorUid: 'adm_1',
        actorEmail: 'adm@test.ir',
        rawRows: [
          {
            product_sku: firstProd.sku,
            variant_sku: 'PHASE6-VAR-NEW',
            label_fa: 'پک تست فاز ۶',
            option_type: 'pack',
            option_value_fa: 'تستی',
            base_price: 750000,
            stock_on_hand: 11,
          },
        ],
      });
      expect(varCommit.ok).toBe(true);
      if (!varCommit.ok) return;
      expect(
        (await repos.catalog.getSnapshot()).products
          .find((p) => p.id === firstProd.id)
          ?.variants.some((v) => v.sku === 'PHASE6-VAR-NEW')
      ).toBe(true);
      await rollbackImportJobService(store, repos, { jobId: varCommit.data.job.id, actorUid: 'adm_1', actorEmail: 'adm@test.ir' });
      expect(
        (await repos.catalog.getSnapshot()).products
          .find((p) => p.id === firstProd.id)
          ?.variants.some((v) => v.sku === 'PHASE6-VAR-NEW')
      ).toBe(false);

      // F. Prices commit & rollback
      const origPrice = firstVar.basePrice!;
      const priceCommit = await commitImportService(store, repos, {
        templateKey: 'prices',
        filename: 'prices.csv',
        actorUid: 'adm_1',
        actorEmail: 'adm@test.ir',
        rawRows: [{ sku: firstVar.sku, base_price: origPrice + 111000, dentist_price: origPrice + 50000 }],
      });
      expect(priceCommit.ok).toBe(true);
      if (!priceCommit.ok) return;
      const updatedProdAfterPrice = (await repos.catalog.getSnapshot()).products.find((p) => p.id === firstProd.id)!;
      expect(updatedProdAfterPrice.variants[0].basePrice).toBe(origPrice + 111000);
      await rollbackImportJobService(store, repos, { jobId: priceCommit.data.job.id, actorUid: 'adm_1', actorEmail: 'adm@test.ir' });
      const restoredProdAfterPrice = (await repos.catalog.getSnapshot()).products.find((p) => p.id === firstProd.id)!;
      expect(restoredProdAfterPrice.variants[0].basePrice).toBe(origPrice);

      // G. Stock commit & rollback via StockRepository
      const levelsBefore = await repos.stock.listStockLevels({ warehouseId: 'wh_teh', variantId: firstVar.id });
      const onHandBefore = levelsBefore[0]?.onHand ?? firstVar.stockOnHand;
      const stockCommit = await commitImportService(store, repos, {
        templateKey: 'stock',
        filename: 'stock.csv',
        actorUid: 'adm_1',
        actorEmail: 'adm@test.ir',
        rawRows: [{ sku: firstVar.sku, warehouse_code: 'TEH-CENTRAL', stock_on_hand: onHandBefore + 33, reason: 'فاز ۶' }],
      });
      expect(stockCommit.ok).toBe(true);
      if (!stockCommit.ok) return;
      const levelsAfter = await repos.stock.listStockLevels({ warehouseId: 'wh_teh', variantId: firstVar.id });
      expect(levelsAfter[0].onHand).toBe(onHandBefore + 33);
      await rollbackImportJobService(store, repos, { jobId: stockCommit.data.job.id, actorUid: 'adm_1', actorEmail: 'adm@test.ir' });
      const levelsRestored = await repos.stock.listStockLevels({ warehouseId: 'wh_teh', variantId: firstVar.id });
      expect(levelsRestored[0].onHand).toBe(onHandBefore);

      // H. Redirects batch commit (>50 rows) + persistence across store reload + rollback
      const batchRows = Array.from({ length: 65 }, (_, i) => ({
        from_path: `/batch-old-${i}`,
        to_path: `/category/${firstCatSlug}`,
        status_code: 301,
      }));
      const redirCommit = await commitImportService(store, repos, {
        templateKey: 'redirects',
        filename: 'redirects-batch.csv',
        actorUid: 'adm_1',
        actorEmail: 'adm@test.ir',
        rawRows: batchRows,
      });
      expect(redirCommit.ok).toBe(true);
      if (!redirCommit.ok) return;
      expect(redirCommit.data.job.counts.createCount).toBe(65);

      const reloadedStore = createServerStore(tmpDir);
      expect(reloadedStore.data.catalogState.redirects.filter((r) => r.fromPath.startsWith('/batch-old-'))).toHaveLength(65);
      expect(reloadedStore.data.importJobs[0].id).toBe(redirCommit.data.job.id);

      await rollbackImportJobService(store, repos, {
        jobId: redirCommit.data.job.id,
        actorUid: 'adm_1',
        actorEmail: 'adm@test.ir',
      });
      expect(store.data.catalogState.redirects.filter((r) => r.fromPath.startsWith('/batch-old-'))).toHaveLength(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 20000);
});

describe('Phase 6 — Express Import/Export HTTP API & RBAC', () => {
  const realFetch = globalThis.fetch;
  let server: import('node:http').Server;
  let baseUrl = '';
  let dataDir = '';
  let stopExpiryJob: () => void = () => {};

  const TOKEN_MAP: Record<string, { uid: string; email: string; role: string }> = {
    'tok-admin': { uid: 'adm_1', email: 'admin@test.ir', role: 'admin' },
    'tok-warehouse': { uid: 'adm_wh', email: 'wh@test.ir', role: 'warehouse' },
    'tok-content': { uid: 'adm_cnt', email: 'cnt@test.ir', role: 'content' },
    'tok-user': { uid: 'usr_1', email: 'user@test.ir', role: '' },
  };

  beforeAll(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dental-phase6-http-'));
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('identitytoolkit.googleapis.com/v1/accounts:lookup')) {
        const body = JSON.parse(String(init?.body || '{}')) as { idToken?: string };
        const user = body.idToken ? TOKEN_MAP[body.idToken] : undefined;
        if (user) {
          return new Response(
            JSON.stringify({ users: [{ localId: user.uid, email: user.email, emailVerified: true }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ error: { message: 'INVALID' } }), { status: 400 });
      }
      if (url.includes(`projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/admins/`)) {
        const auth = ((init?.headers as Record<string, string>)?.Authorization || '').replace(/^Bearer\s+/i, '');
        const user = TOKEN_MAP[auth];
        if (user?.role) {
          return new Response(JSON.stringify({ fields: { role: { stringValue: user.role } } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ error: { status: 'PERMISSION_DENIED' } }), { status: 403 });
      }
      return realFetch(input, init);
    }) as typeof fetch;

    const created = await createServerApp({ dataDir, attachVite: false });
    stopExpiryJob = created.stopExpiryJob;
    await new Promise<void>((resolve) => {
      server = created.app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    stopExpiryJob();
    globalThis.fetch = realFetch;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('enforces RBAC on import/export endpoints (401 guest, 403 buyer & warehouse-on-products, 200 warehouse-on-stock)', async () => {
    const unauth = await realFetch(`${baseUrl}/api/admin/import/templates`);
    expect(unauth.status).toBe(401);

    const buyer = await realFetch(`${baseUrl}/api/admin/import/templates`, {
      headers: { Authorization: 'Bearer tok-user' },
    });
    expect(buyer.status).toBe(403);

    const whProdExport = await realFetch(`${baseUrl}/api/admin/import/export/products?format=csv`, {
      headers: { Authorization: 'Bearer tok-warehouse' },
    });
    expect(whProdExport.status).toBe(403);

    const whStockExport = await realFetch(`${baseUrl}/api/admin/import/export/stock?format=csv`, {
      headers: { Authorization: 'Bearer tok-warehouse' },
    });
    expect(whStockExport.status).toBe(200);
    const csvText = await whStockExport.text();
    expect(csvText).toContain('warehouse_code');
  });

  it('completes parse -> validate -> commit -> jobs -> rollback over HTTP with XLSX and CSV round-trip', async () => {
    // Export existing redirects as XLSX
    const expXlsxRes = await realFetch(`${baseUrl}/api/admin/import/export/redirects?format=xlsx`, {
      headers: { Authorization: 'Bearer tok-admin' },
    });
    expect(expXlsxRes.status).toBe(200);
    const xlsxBuf = await expXlsxRes.arrayBuffer();

    // Parse exported XLSX via /api/admin/import/parse
    const parseRes = await realFetch(`${baseUrl}/api/admin/import/parse`, {
      method: 'POST',
      headers: { Authorization: 'Bearer tok-admin', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'redirects-export.xlsx',
        contentBase64: Buffer.from(xlsxBuf).toString('base64'),
      }),
    });
    expect(parseRes.status).toBe(200);
    const parsedJson = (await parseRes.json()) as {
      ok: boolean;
      detectedTemplateKey: string;
      matrix: string[][];
    };
    expect(parsedJson.ok).toBe(true);
    expect(parsedJson.detectedTemplateKey).toBe('redirects');

    // Add a new redirect row & an invalid row, validate via endpoint
    const validateRes = await realFetch(`${baseUrl}/api/admin/import/validate`, {
      method: 'POST',
      headers: { Authorization: 'Bearer tok-admin', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateKey: 'redirects',
        rows: [
          { from_path: '/http-p6-test', to_path: '/products', status_code: '301' },
          { from_path: '/http-loop', to_path: '/http-loop', status_code: '301' },
        ],
      }),
    });
    expect(validateRes.status).toBe(200);
    const valJson = (await validateRes.json()) as {
      dryRun: { summary: { createCount: number; errorCount: number } };
      errorReportRows: Record<string, unknown>[];
    };
    expect(valJson.dryRun.summary.createCount).toBe(1);
    expect(valJson.dryRun.summary.errorCount).toBe(1);
    expect(valJson.errorReportRows).toHaveLength(1);

    // Commit via endpoint
    const commitRes = await realFetch(`${baseUrl}/api/admin/import/commit`, {
      method: 'POST',
      headers: { Authorization: 'Bearer tok-admin', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateKey: 'redirects',
        filename: 'p6-http.csv',
        rows: [{ from_path: '/http-p6-test', to_path: '/products', status_code: '301' }],
      }),
    });
    expect(commitRes.status).toBe(200);
    const commitJson = (await commitRes.json()) as { ok: boolean; job: { id: string; status: string } };
    expect(commitJson.ok).toBe(true);
    expect(commitJson.job.status).toBe('committed');

    // Verify redirect works live before rollback
    const redirHit = await realFetch(`${baseUrl}/http-p6-test`, { redirect: 'manual' });
    expect(redirHit.status).toBe(301);

    // Rollback via endpoint
    const rbRes = await realFetch(`${baseUrl}/api/admin/import/jobs/${commitJson.job.id}/rollback`, {
      method: 'POST',
      headers: { Authorization: 'Bearer tok-admin' },
    });
    expect(rbRes.status).toBe(200);
    const rbJson = (await rbRes.json()) as { ok: boolean; job: { status: string } };
    expect(rbJson.job.status).toBe('rolled_back');

    // Redirect no longer triggers after rollback
    const redirAfterRb = await realFetch(`${baseUrl}/http-p6-test`, { redirect: 'manual' });
    expect(redirAfterRb.status).not.toBe(301);
  });
});
