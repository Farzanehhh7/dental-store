import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import firebaseConfig from '../firebase-applet-config.json';
import { createServerApp } from '../server';
import {
  REPORT_CATALOG,
  REPORT_REGISTRY,
  getReportDefinition,
  runReportById,
  type ReportDataset,
} from '../src/pages/admin/reports';
import type { SiteSettings } from '../src/types/domain';

const TEST_SETTINGS: SiteSettings = {
  id: 'main',
  storeNameFa: 'دنتال مارکت تست',
  phone: '02188000000',
  addressFa: 'تهران',
  workingHoursFa: '۹ تا ۱۸',
  imedRegistryCode: 'IM-01',
  enamadCode: 'EN-01',
  taxRatePercent: 10,
  freeShippingThreshold: 10_000_000,
  nearExpiryThresholdDays: 90,
  discountProofMinDays: 14,
  indexableFacetThreshold: 2,
  discontinuedGraceDays: 30,
};

function createGoldenFixtureDataset(): ReportDataset {
  // 2026-03-21T10:00:00.000Z === 1405/01/01 (Farvardin 1, 1405)
  // 2026-04-01T10:00:00.000Z === 1405/01/12 (Farvardin 12, 1405)
  // 2026-06-22T10:00:00.000Z === 1405/04/01 (Tir 1, 1405 - Q2)
  const now = new Date('2026-04-05T12:00:00.000Z');
  return {
    now,
    settings: TEST_SETTINGS,
    categories: [
      {
        id: 'cat_comp',
        parentId: null,
        path: 'consumables/restorative',
        depth: 0,
        vertical: 'dental',
        nameFa: 'مواد ترمیمی',
        nameEn: 'Restorative',
        slug: 'restorative',
        descriptionFa: 'مواد ترمیمی دندانپزشکی استاندارد مطب',
        seoTextFa: 'متن کامل سئوی تخصصی دسته‌بندی مواد ترمیمی دندانپزشکی با طول مناسب بالای پنجاه کاراکتر',
        isActive: true,
        showInMenu: true,
        showOnHome: true,
        sortOrder: 1,
        attributeIds: [],
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
      {
        id: 'cat_equip',
        parentId: null,
        path: 'equipment/sterilization',
        depth: 0,
        vertical: 'dental',
        nameFa: 'تجهیزات استریل',
        nameEn: 'Sterilization',
        slug: 'sterilization',
        descriptionFa: 'اتوکلاو و تجهیزات اتاق استریل',
        seoTextFa: 'متن کامل سئوی تجهیزات استریل کلینیک‌های دندانپزشکی با طول استاندارد کافی',
        isActive: true,
        showInMenu: true,
        showOnHome: true,
        sortOrder: 2,
        attributeIds: [],
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
    ],
    brands: [
      {
        id: 'brand_3m',
        nameFa: 'تری‌ام (3M)',
        nameEn: '3M ESPE',
        slug: '3m',
        countryCode: 'US',
        countryFa: 'آمریکا',
        descriptionFa: 'برند ترمیمی',
        isAuthorizedDealer: true,
        isActive: true,
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
      {
        id: 'brand_melag',
        nameFa: 'ملاگ (MELAG)',
        nameEn: 'MELAG',
        slug: 'melag',
        countryCode: 'DE',
        countryFa: 'آلمان',
        descriptionFa: 'تجهیزات استریل',
        isAuthorizedDealer: true,
        isActive: true,
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
    ],
    products: [
      {
        id: 'prod_1',
        vertical: 'dental',
        sku: 'SKU-COMP-A2',
        imedCode: 'IM-1001',
        titleFa: 'کامپوزیت یونیورسال A2',
        titleEn: 'Universal Composite A2',
        slug: 'universal-composite-a2',
        brandId: 'brand_3m',
        originCountryCode: 'US',
        originCountryFa: 'آمریکا',
        primaryCategoryId: 'cat_comp',
        categoryIds: ['cat_comp'],
        kind: 'consumable',
        status: 'active',
        pricingMode: 'fixed',
        shortDescriptionFa: 'کامپوزیت نانوهیبرید با استحکام بالا و پالیش آسان',
        descriptionFa: 'توضیح کامل محصول',
        imageUrl: '/img/comp.jpg',
        galleryUrls: [],
        installationAvailable: false,
        trainingAvailable: false,
        minOrderQty: 1,
        ratingAvg: 4.8,
        ratingCount: 1,
        viewCount: 100,
        soldCount: 5,
        tags: [],
        attributes: {},
        files: [
          { id: 'f1', type: 'certificate_ce', titleFa: 'گواهینامه CE', fileSizeLabel: '1MB', isVerified: true },
        ],
        variants: [
          {
            id: 'var_1',
            sku: 'SKU-COMP-A2',
            labelFa: 'شید A2',
            optionType: 'shade',
            optionValueFa: 'A2',
            basePrice: 2_000_000,
            stockOnHand: 20,
            reserved: 2,
            lowStockThreshold: 5,
            weightG: 100,
            isActive: true,
          },
        ],
        publishedAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
      {
        id: 'prod_2',
        vertical: 'dental',
        sku: 'SKU-AUTO-24',
        imedCode: undefined,
        titleFa: 'اتوکلاو کلینیکی ۲۴ لیتری',
        titleEn: 'Autoclave 24L',
        slug: 'autoclave-24l',
        brandId: 'brand_melag',
        originCountryCode: 'DE',
        originCountryFa: 'آلمان',
        primaryCategoryId: 'cat_equip',
        categoryIds: ['cat_equip'],
        kind: 'capital_equipment',
        status: 'active',
        pricingMode: 'fixed',
        shortDescriptionFa: 'اتوکلاو کلاس B مناسب مطب و کلینیک با پرینتر حرارتی',
        descriptionFa: 'توضیح کامل اتوکلاو',
        imageUrl: '/img/auto.jpg',
        galleryUrls: [],
        installationAvailable: true,
        trainingAvailable: true,
        minOrderQty: 1,
        ratingAvg: 0,
        ratingCount: 0,
        viewCount: 50,
        soldCount: 0,
        tags: [],
        attributes: {},
        files: [],
        variants: [
          {
            id: 'var_2',
            sku: 'SKU-AUTO-24',
            labelFa: '۲۴ لیتری',
            optionType: 'model',
            optionValueFa: '24L',
            basePrice: 10_000_000,
            stockOnHand: 4,
            reserved: 1,
            lowStockThreshold: 5,
            weightG: 45000,
            isActive: true,
          },
        ],
        publishedAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
    ],
    productCosts: [
      { productId: 'prod_1', variantCosts: { var_1: 1_200_000 }, updatedAt: '2026-03-01T00:00:00.000Z' },
      { productId: 'prod_2', variantCosts: { var_2: 7_500_000 }, updatedAt: '2026-03-01T00:00:00.000Z' },
    ],
    warehouses: [
      { id: 'wh_teh', code: 'TEH', nameFa: 'انبار تهران', city: 'تهران', address: 'تهران', isActive: true, isDefault: true },
      { id: 'wh_isf', code: 'ISF', nameFa: 'انبار اصفهان', city: 'اصفهان', address: 'اصفهان', isActive: true },
    ],
    stockLevels: [
      {
        id: 'wh_teh__var_1',
        productId: 'prod_1',
        variantId: 'var_1',
        sku: 'SKU-COMP-A2',
        warehouseId: 'wh_teh',
        warehouseCode: 'TEH',
        onHand: 20,
        reserved: 2,
        lowStockThreshold: 5,
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'wh_isf__var_2',
        productId: 'prod_2',
        variantId: 'var_2',
        sku: 'SKU-AUTO-24',
        warehouseId: 'wh_isf',
        warehouseCode: 'ISF',
        onHand: 4,
        reserved: 1,
        lowStockThreshold: 5,
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
    ],
    stockBatches: [
      {
        id: 'bat_1',
        productId: 'prod_1',
        variantId: 'var_1',
        warehouseId: 'wh_teh',
        warehouseCode: 'TEH',
        batchNo: 'B-2026-NEAR',
        expiryDate: '2026-05-01T00:00:00.000Z', // ~26 days -> critical <= 30 days
        qty: 10,
        reserved: 1,
        specialPrice: 1_750_000,
        condition: 'resellable',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'bat_2',
        productId: 'prod_1',
        variantId: 'var_1',
        warehouseId: 'wh_teh',
        warehouseCode: 'TEH',
        batchNo: 'B-2027-OK',
        expiryDate: '2027-01-01T00:00:00.000Z',
        qty: 10,
        reserved: 1,
        specialPrice: null,
        condition: 'resellable',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
    ],
    stockMovements: [
      {
        id: 'sm_1',
        productId: 'prod_1',
        productTitleFa: 'کامپوزیت یونیورسال A2',
        variantId: 'var_1',
        sku: 'SKU-COMP-A2',
        warehouseId: 'wh_teh',
        warehouseCode: 'TEH',
        batchNo: 'B-2026-NEAR',
        delta: 15,
        type: 'receive',
        reason: 'رسید اولیه انبار',
        actorEmail: 'wh@test.ir',
        createdAt: '2026-03-21T10:00:00.000Z',
      },
      {
        id: 'sm_2',
        productId: 'prod_1',
        productTitleFa: 'کامپوزیت یونیورسال A2',
        variantId: 'var_1',
        sku: 'SKU-COMP-A2',
        warehouseId: 'wh_teh',
        warehouseCode: 'TEH',
        delta: -3,
        type: 'commit',
        reason: 'خروج قطعی سفارش',
        actorEmail: 'sys@test.ir',
        createdAt: '2026-04-01T10:00:00.000Z',
      },
    ],
    campaigns: [
      {
        id: 'camp_1',
        nameFa: 'کمپین بهاره ترمیمی',
        slug: 'spring-comp',
        type: 'percent',
        discountPercent: 10,
        startsAt: '2026-03-20T00:00:00.000Z',
        endsAt: '2026-04-20T00:00:00.000Z',
        showTimer: true,
        badgeTextFa: '۱۰٪ تخفیف',
        status: 'active',
        productIds: ['prod_1'],
        updatedAt: '2026-03-20T00:00:00.000Z',
      },
    ],
    coupons: [
      {
        id: 'cpn_1',
        code: 'SPRING10',
        type: 'percent',
        value: 10,
        minOrderAmount: 1_000_000,
        startsAt: '2026-03-20T00:00:00.000Z',
        endsAt: '2026-05-20T00:00:00.000Z',
        usageCount: 2,
        usageLimit: 100,
        isActive: true,
      },
    ],
    orders: [
      {
        id: 'ord_1',
        orderNo: 'DM-1001',
        userId: 'usr_clinic_1',
        customerName: 'کلینیک مهر',
        customerMobile: '09121111111',
        customerGroup: 'clinic',
        status: 'delivered',
        paymentStatus: 'paid',
        paymentMethod: 'online',
        couponCode: 'SPRING10',
        subtotal: 4_000_000,
        discountTotal: 400_000,
        shippingTotal: 0,
        taxTotal: 360_000,
        grandTotal: 3_960_000,
        shippingMethod: 'پیک تهران',
        shippingAddress: { province: 'تهران', city: 'تهران', postalCode: '1111111111', addressLine: 'خیابان الف' },
        items: [
          {
            productId: 'prod_1',
            variantId: 'var_1',
            sku: 'SKU-COMP-A2',
            titleFa: 'کامپوزیت یونیورسال A2',
            variantLabelFa: 'شید A2',
            quantity: 2,
            unitPrice: 1_800_000,
            discountAmount: 200_000,
            lineTotal: 3_600_000,
            priceSource: 'campaign',
          },
        ],
        createdAt: '2026-03-21T10:00:00.000Z',
        updatedAt: '2026-03-22T10:00:00.000Z',
      },
      {
        id: 'ord_2',
        orderNo: 'DM-1002',
        userId: 'usr_clinic_1',
        customerName: 'کلینیک مهر',
        customerMobile: '09121111111',
        customerGroup: 'clinic',
        status: 'paid',
        paymentStatus: 'paid',
        paymentMethod: 'online',
        subtotal: 2_000_000,
        discountTotal: 0,
        shippingTotal: 100_000,
        taxTotal: 200_000,
        grandTotal: 2_300_000,
        shippingMethod: 'تیپاکس',
        shippingAddress: { province: 'تهران', city: 'ری', postalCode: '1111111112', addressLine: 'خیابان ب' },
        items: [
          {
            productId: 'prod_1',
            variantId: 'var_1',
            sku: 'SKU-COMP-A2',
            titleFa: 'کامپوزیت یونیورسال A2',
            variantLabelFa: 'شید A2',
            quantity: 1,
            unitPrice: 2_000_000,
            discountAmount: 0,
            lineTotal: 2_000_000,
            priceSource: 'base',
          },
        ],
        createdAt: '2026-04-01T10:00:00.000Z',
        updatedAt: '2026-04-01T10:00:00.000Z',
      },
      {
        id: 'ord_3',
        orderNo: 'DM-1003',
        userId: 'usr_dentist_2',
        customerName: 'دکتر سارا نادری',
        customerMobile: '09132222222',
        customerGroup: 'dentist',
        status: 'awaiting_review',
        paymentStatus: 'pending_credit',
        paymentMethod: 'cheque_request',
        subtotal: 10_000_000,
        discountTotal: 0,
        shippingTotal: 0,
        taxTotal: 1_000_000,
        grandTotal: 11_000_000,
        shippingMethod: 'باربری',
        shippingAddress: { province: 'اصفهان', city: 'اصفهان', postalCode: '8111111111', addressLine: 'خیابان ج' },
        items: [
          {
            productId: 'prod_1',
            variantId: 'var_1',
            sku: 'SKU-COMP-A2',
            titleFa: 'کامپوزیت یونیورسال A2',
            variantLabelFa: 'شید A2',
            quantity: 5,
            unitPrice: 2_000_000,
            discountAmount: 0,
            lineTotal: 10_000_000,
            priceSource: 'base',
          },
        ],
        createdAt: '2026-06-22T10:00:00.000Z',
        updatedAt: '2026-06-22T10:00:00.000Z',
      },
      {
        id: 'ord_4_cancelled',
        orderNo: 'DM-1004',
        userId: 'usr_retail_3',
        customerName: 'کاربر لغو',
        customerMobile: '09123333333',
        customerGroup: 'retail',
        status: 'cancelled',
        paymentStatus: 'unpaid',
        paymentMethod: 'online',
        subtotal: 2_000_000,
        discountTotal: 0,
        shippingTotal: 50_000,
        taxTotal: 200_000,
        grandTotal: 2_250_000,
        shippingMethod: 'پیک',
        shippingAddress: { province: 'فارس', city: 'شیراز', postalCode: '7111111111', addressLine: 'خیابان د' },
        items: [
          {
            productId: 'prod_2',
            variantId: 'var_2',
            sku: 'SKU-AUTO-24',
            titleFa: 'اتوکلاو کلینیکی ۲۴ لیتری',
            variantLabelFa: '۲۴ لیتری',
            quantity: 1,
            unitPrice: 10_000_000,
            discountAmount: 0,
            lineTotal: 10_000_000,
            priceSource: 'base',
          },
        ],
        createdAt: '2026-04-02T10:00:00.000Z',
        updatedAt: '2026-04-02T11:00:00.000Z',
      },
    ],
    paymentLedger: [
      {
        id: 'pay_1',
        orderId: 'ord_1',
        orderNo: 'DM-1001',
        gateway: 'zarinpal',
        amount: 3_960_000,
        idempotencyKey: 'k1',
        refId: 'REF-1001',
        status: 'verified',
        createdAt: '2026-03-21T10:05:00.000Z',
      },
      {
        id: 'pay_2',
        orderId: 'ord_2',
        orderNo: 'DM-1002',
        gateway: 'idpay',
        amount: 2_300_000,
        idempotencyKey: 'k2',
        refId: 'REF-1002',
        status: 'verified',
        createdAt: '2026-04-01T10:05:00.000Z',
      },
    ],
    invoices: [
      {
        id: 'inv_1',
        invoiceNo: 'INV-101',
        orderId: 'ord_1',
        orderNo: 'DM-1001',
        userId: 'usr_clinic_1',
        customerName: 'کلینیک مهر',
        isOfficial: true,
        nationalId: '14001112223',
        economicCode: '411111111111',
        subtotal: 4_000_000,
        discountTotal: 400_000,
        taxTotal: 360_000,
        grandTotal: 3_960_000,
        status: 'issued',
        issuedAt: '2026-03-21T12:00:00.000Z',
      },
      {
        id: 'inv_2',
        invoiceNo: 'INV-102',
        orderId: 'ord_2',
        orderNo: 'DM-1002',
        userId: 'usr_clinic_1',
        customerName: 'کلینیک مهر',
        isOfficial: false,
        subtotal: 2_000_000,
        discountTotal: 0,
        taxTotal: 200_000,
        grandTotal: 2_300_000,
        status: 'voided',
        issuedAt: '2026-04-01T12:00:00.000Z',
      },
    ],
    proformas: [
      {
        id: 'pf_1',
        proformaNo: 'PF-101',
        userId: 'usr_clinic_1',
        contactName: 'دکتر مهر',
        contactMobile: '09121111111',
        clinicName: 'کلینیک مهر',
        status: 'converted',
        subtotal: 10_000_000,
        discountTotal: 0,
        taxTotal: 1_000_000,
        grandTotal: 11_000_000,
        items: [],
        termsFa: 'نقدی',
        validUntil: '2026-04-15T00:00:00.000Z',
        orderId: 'ord_3',
        createdAt: '2026-03-25T10:00:00.000Z',
        updatedAt: '2026-03-26T10:00:00.000Z',
      },
      {
        id: 'pf_2',
        proformaNo: 'PF-102',
        userId: 'usr_dentist_2',
        contactName: 'دکتر نادری',
        contactMobile: '09132222222',
        clinicName: 'مطب نادری',
        status: 'sent',
        subtotal: 5_000_000,
        discountTotal: 0,
        taxTotal: 500_000,
        grandTotal: 5_500_000,
        items: [],
        termsFa: '۷ روز',
        validUntil: '2026-04-20T00:00:00.000Z',
        createdAt: '2026-04-01T10:00:00.000Z',
        updatedAt: '2026-04-01T10:00:00.000Z',
      },
    ],
    rfqs: [],
    paymentPlans: [
      {
        id: 'pp_1',
        orderId: 'ord_3',
        userId: 'usr_dentist_2',
        customerName: 'دکتر سارا نادری',
        type: 'cheque',
        requestedAmount: 11_000_000,
        installmentsCount: 2,
        proposedTermsFa: '۲ فقره چک صیادی',
        status: 'active',
        createdAt: '2026-04-01T10:00:00.000Z',
        updatedAt: '2026-04-01T10:00:00.000Z',
      },
    ],
    returns: [
      {
        id: 'ret_1',
        returnNo: 'RT-101',
        orderId: 'ord_1',
        orderNo: 'DM-1001',
        userId: 'usr_clinic_1',
        customerName: 'کلینیک مهر',
        items: [{ productId: 'prod_1', variantId: 'var_1', titleFa: 'کامپوزیت', quantity: 1 }],
        reasonFa: 'اشتباه در انتخاب شید',
        resolution: 'refund',
        status: 'refunded',
        condition: 'resellable',
        refundAmount: 1_800_000,
        createdAt: '2026-03-25T10:00:00.000Z',
        updatedAt: '2026-03-26T10:00:00.000Z',
      },
    ],
    b2bVerifications: [
      {
        id: 'b2b_1',
        userId: 'usr_clinic_1',
        applicantName: 'مدیر کلینیک مهر',
        mobile: '09121111111',
        requestedGroup: 'clinic',
        clinicName: 'کلینیک مهر',
        medicalCouncilNo: '12345',
        status: 'approved',
        createdAt: '2026-03-21T08:00:00.000Z',
        updatedAt: '2026-03-21T09:00:00.000Z',
      },
      {
        id: 'b2b_2',
        userId: 'usr_dentist_2',
        applicantName: 'دکتر سارا نادری',
        mobile: '09132222222',
        requestedGroup: 'dentist',
        clinicName: 'مطب نادری',
        medicalCouncilNo: '54321',
        status: 'pending',
        createdAt: '2026-04-02T08:00:00.000Z',
        updatedAt: '2026-04-02T08:00:00.000Z',
      },
    ],
    usersList: [
      {
        uid: 'usr_clinic_1',
        displayName: 'کلینیک مهر',
        clinicName: 'کلینیک تخصصی مهر',
        customerGroup: 'clinic',
        accountType: 'clinic',
        b2bStatus: 'approved',
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-21T00:00:00.000Z',
      },
    ],
    tickets: [
      {
        id: 'tkt_1',
        ticketNo: 'TK-101',
        userId: 'usr_clinic_1',
        orderNo: 'DM-1001',
        subject: 'پیگیری فاکتور رسمی',
        department: 'accounting',
        priority: 'high',
        status: 'resolved',
        messages: [
          { authorName: 'کلینیک مهر', isStaff: false, body: 'ارسال شود', createdAt: '2026-04-01T10:00:00.000Z' },
          { authorName: 'حسابدار', isStaff: true, body: 'ارسال شد', createdAt: '2026-04-01T10:30:00.000Z' },
        ],
        createdAt: '2026-04-01T10:00:00.000Z',
        updatedAt: '2026-04-01T12:00:00.000Z',
      },
    ],
    consultationRequests: [
      {
        id: 'con_1',
        userId: 'usr_clinic_1',
        name: 'دکتر مهر',
        mobile: '09121111111',
        clinicName: 'کلینیک مهر',
        productId: 'prod_2',
        productName: 'اتوکلاو کلینیکی ۲۴ لیتری',
        budgetRange: '۱۰ میلیون',
        status: 'won',
        createdAt: '2026-03-22T09:00:00.000Z',
      },
      {
        id: 'con_2',
        userId: 'usr_dentist_2',
        name: 'دکتر نادری',
        mobile: '09132222222',
        clinicName: 'مطب نادری',
        productId: 'prod_2',
        productName: 'اتوکلاو کلینیکی ۲۴ لیتری',
        budgetRange: '۱۰ میلیون',
        status: 'lost',
        createdAt: '2026-04-01T09:00:00.000Z',
      },
    ],
    blogPosts: [
      {
        id: 'post_no_author',
        titleFa: 'راهنمای انتخاب کامپوزیت',
        slug: 'composite-guide',
        categoryFa: 'آموزش',
        excerptFa: 'خلاصه',
        bodyFa: 'متن کامل مقاله',
        imageUrl: '/img/post.jpg',
        authorName: '',
        authorRole: 'تحریریه',
        readingMinutes: 5,
        productIds: ['prod_1'],
        status: 'published',
        publishedAt: '2026-03-20T00:00:00.000Z',
        updatedAt: '2026-03-20T00:00:00.000Z',
      },
    ],
    notFoundLogs: [
      { id: 'nf_1', path: '/old-composite', hitCount: 15, lastSeenAt: '2026-04-01T10:00:00.000Z' },
      { id: 'nf_2', path: '/broken-missing-page', hitCount: 8, lastSeenAt: '2026-04-02T10:00:00.000Z' },
    ],
    redirects: [
      {
        id: 'red_1',
        fromPath: '/old-composite',
        toPath: '/product/universal-composite-a2',
        statusCode: 301,
        hitCount: 30,
        createdAt: '2026-03-15T10:00:00.000Z',
      },
    ],
    reviews: [
      {
        id: 'rev_1',
        productId: 'prod_1',
        userId: 'usr_clinic_1',
        authorName: 'دکتر مهر',
        rating: 5,
        body: 'عالی بود',
        status: 'approved',
        createdAt: '2026-03-25T10:00:00.000Z',
      },
    ],
    questions: [
      {
        id: 'q_1',
        productId: 'prod_1',
        userId: 'usr_clinic_1',
        authorName: 'دکتر مهر',
        body: 'تاریخ انقضا؟',
        answerBody: 'بیش از یک سال',
        answeredBy: 'ادمین',
        status: 'approved',
        createdAt: '2026-03-25T10:00:00.000Z',
      },
    ],
    abandonedCarts: [
      {
        id: 'cart_ab_1',
        ownerKey: 'usr_clinic_1',
        userId: 'usr_clinic_1',
        mobile: '09121112233',
        customerName: 'کلینیک دندانپزشکی مهر',
        items: [
          {
            productId: 'prod_1',
            variantId: 'var_1',
            sku: 'SKU-COMP-A2',
            titleFa: 'کامپوزیت یونیورسال A2',
            variantLabelFa: 'سرنگ ۴ گرمی',
            quantity: 2,
            unitPrice: 1_000_000,
            lineTotal: 2_000_000,
          },
        ],
        subtotal: 2_000_000,
        status: 'reminded',
        consentGranted: true,
        reminderCount: 1,
        lastReminderAt: '2026-04-02T10:00:00.000Z',
        lastActivityAt: '2026-04-01T10:00:00.000Z',
        abandonedAt: '2026-04-01T11:00:00.000Z',
        createdAt: '2026-04-01T10:00:00.000Z',
        updatedAt: '2026-04-02T10:00:00.000Z',
      },
      {
        id: 'cart_ab_2',
        ownerKey: 'usr_dentist_1',
        userId: 'usr_dentist_1',
        mobile: '09123334455',
        customerName: 'دکتر شریفی',
        items: [
          {
            productId: 'prod_1',
            variantId: 'var_1',
            sku: 'SKU-COMP-A2',
            titleFa: 'کامپوزیت یونیورسال A2',
            variantLabelFa: 'سرنگ ۴ گرمی',
            quantity: 3,
            unitPrice: 1_000_000,
            lineTotal: 3_000_000,
          },
        ],
        subtotal: 3_000_000,
        status: 'recovered',
        consentGranted: true,
        recoveredOrderId: 'ord_2',
        reminderCount: 1,
        lastReminderAt: '2026-03-31T10:00:00.000Z',
        lastActivityAt: '2026-03-30T10:00:00.000Z',
        abandonedAt: '2026-03-30T11:00:00.000Z',
        createdAt: '2026-03-30T10:00:00.000Z',
        updatedAt: '2026-04-01T09:00:00.000Z',
      },
    ],
  };
}

describe('Phase 5 — Modular 29-Report Engine & Server Endpoint', () => {
  const fixture = createGoldenFixtureDataset();

  it('registers all 29 reports with dedicated files and rejects unknown report IDs cleanly', () => {
    expect(REPORT_CATALOG).toHaveLength(29);
    expect(REPORT_REGISTRY).toHaveLength(29);

    for (const rep of REPORT_CATALOG) {
      const filePath = path.resolve(process.cwd(), 'src/pages/admin/reports', `${rep.id}.ts`);
      expect(fs.existsSync(filePath)).toBe(true);
      expect(getReportDefinition(rep.id)).not.toBeNull();
    }

    const unknown = runReportById('does_not_exist_report', fixture);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.status).toBe(404);
      expect(unknown.message).toContain('does_not_exist_report');
    }
  });

  // Explicit golden output unit tests covering ALL 29 reports individually
  it('1. sales_daily computes daily revenue, excludes cancelled orders, and supports Jalali filtering', () => {
    const res = runReportById('sales_daily', fixture, { from: '1405/01/01', to: '1405/01/20' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.report.rows).toHaveLength(2);
    expect(res.report.totalsRow?.ordersCount).toBe(2);
    expect(res.report.totalsRow?.grandTotal).toBe(6_260_000);
    expect(res.report.chart?.data.length).toBe(2);
  });

  it('2. sales_by_category computes net sales share across categories', () => {
    const res = runReportById('sales_by_category', fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.report.rows).toHaveLength(1);
    expect(res.report.rows[0].categoryName).toBe('مواد ترمیمی');
    expect(res.report.rows[0].unitsSold).toBe(8);
    expect(res.report.rows[0].lineRevenue).toBe(15_600_000);
    expect(res.report.rows[0].sharePercent).toBe(100);
  });

  it('3. sales_by_brand computes brand performance and sharePercent', () => {
    const res = runReportById('sales_by_brand', fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.report.rows[0].brandName).toBe('تری‌ام (3M)');
    expect(res.report.rows[0].revenue).toBe(15_600_000);
    expect(res.report.rows[1].revenue).toBe(0);
  });

  it('4. sales_by_sku ranks SKUs by revenue and joins available stock', () => {
    const res = runReportById('sales_by_sku', fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.report.rows[0].sku).toBe('SKU-COMP-A2');
    expect(res.report.rows[0].unitsSold).toBe(8);
    expect(res.report.rows[0].availableStock).toBe(18); // 20 - 2
  });

  it('5. sales_by_group breaks down buyers, orders, and AOV by customer group', () => {
    const res = runReportById('sales_by_group', fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const dentistRow = res.report.rows.find((r) => r.groupLabel === 'دندانپزشک');
    const clinicRow = res.report.rows.find((r) => r.groupLabel === 'کلینیک / درمانگاه');
    expect(clinicRow?.ordersCount).toBe(2);
    expect(clinicRow?.buyersCount).toBe(1);
    expect(dentistRow?.grandTotal).toBe(11_000_000);
  });

  it('6. sales_by_province aggregates provinces and active city counts', () => {
    const res = runReportById('sales_by_province', fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const isf = res.report.rows.find((r) => r.province === 'اصفهان');
    const teh = res.report.rows.find((r) => r.province === 'تهران');
    expect(teh?.citiesCount).toBe(2); // تهران + ری
    expect(isf?.ordersCount).toBe(1);
  });

  it('7. orders_funnel tracks statuses including cancelled orders and computes drop-off rate', () => {
    const res = runReportById('orders_funnel', fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.report.totalsRow?.ordersCount).toBe(4);
    expect(res.report.rows.some((r) => r.statusCode === 'cancelled')).toBe(true);
  });

  it('8. coupon_effectiveness evaluates both coupons and seasonal campaigns', () => {
    const res = runReportById('coupon_effectiveness', fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const cpnRow = res.report.rows.find((r) => r.codeOrName === 'SPRING10');
    const campRow = res.report.rows.find((r) => r.codeOrName === 'کمپین بهاره ترمیمی');
    expect(cpnRow?.ordersCount).toBe(1);
    expect(cpnRow?.attributedRevenue).toBe(3_960_000);
    expect(campRow?.attributedRevenue).toBe(3_600_000);
  });

  it('9. abandoned_recovery computes real abandoned, reminded, and recovered cart metrics', () => {
    const res = runReportById('abandoned_recovery', fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.report.available).toBe(true);
    expect(res.report.rows).toHaveLength(2);
    expect(res.report.totalsRow?.subtotal).toBe(5_000_000);
    expect(res.report.totalsRow?.reminderCount).toBe(2);
    const rateSummary = res.report.summary.find((s) => s.label === 'نرخ بازیابی');
    expect(rateSummary?.value).toBe(50);
  });

  it('10. payment_methods reconciles order totals against verified payment ledger', () => {
    const res = runReportById('payment_methods', fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const onlineRow = res.report.rows.find((r) => r.methodCode === 'online');
    expect(onlineRow?.ordersCount).toBe(2);
    expect(onlineRow?.verifiedLedgerAmount).toBe(6_260_000);
  });

  it('11. tax_vat_ledger aggregates VAT and taxable base by Jalali quarter', () => {
    const res = runReportById('tax_vat_ledger', fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.report.rows).toHaveLength(2); // 1405 - فصل 1 & 1405 - فصل 2
    expect(res.report.totalsRow?.taxTotal).toBe(1_560_000);
  });

  it('12. official_invoices distinguishes issued/voided invoices and official tax IDs', () => {
    const res = runReportById('official_invoices', fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.report.rows).toHaveLength(2);
    expect(res.report.totalsRow?.grandTotal).toBe(3_960_000); // Only issued counted in issued totals
  });

  it('13. credit_exposure evaluates B2B credit/cheque payment plans', () => {
    const res = runReportById('credit_exposure', fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.report.rows).toHaveLength(1);
    expect(res.report.rows[0].perInstallment).toBe(5_500_000);
    expect(res.report.totalsRow?.requestedAmount).toBe(11_000_000);
  });

  it('14. refunds_rma reports return condition, resolution, and refund total', () => {
    const res = runReportById('refunds_rma', fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.report.rows).toHaveLength(1);
    expect(res.report.rows[0].refundAmount).toBe(1_800_000);
  });

  it('15. proforma_conversion calculates proforma conversion rate accurately', () => {
    const res = runReportById('proforma_conversion', fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.report.rows).toHaveLength(2);
    expect(res.report.summary.find((s) => s.label.includes('نرخ تبدیل'))?.value).toBe(50);
  });

  it('16. gross_margin computes confidential unit profit and realized gross margin', () => {
    const res = runReportById('gross_margin', fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const compRow = res.report.rows.find((r) => r.sku === 'SKU-COMP-A2');
    expect(compRow?.unitProfit).toBe(800_000);
    expect(compRow?.soldQty).toBe(8);
    expect(compRow?.realizedProfit).toBe(6_000_000); // (3.6 + 2.0 + 10.0) - (8 * 1.2) = 15.6 - 9.6
  });

  it('17. stock_valuation computes warehouse cost and retail value using onHand and available', () => {
    const res = runReportById('stock_valuation', fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.report.rows).toHaveLength(2);
    expect(res.report.totalsRow?.costValue).toBe(54_000_000); // 20*1.2M + 4*7.5M
    expect(res.report.totalsRow?.available).toBe(21); // 18 + 3
  });

  it('18. low_stock_alert filters variants where available <= lowStockThreshold', () => {
    const res = runReportById('low_stock_alert', fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.report.rows).toHaveLength(1);
    expect(res.report.rows[0].sku).toBe('SKU-AUTO-24');
    expect(res.report.rows[0].available).toBe(3);
  });

  it('19. fefo_expiry orders batches FEFO and identifies near-expiry batches <= 90 days', () => {
    const res = runReportById('fefo_expiry', fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.report.rows).toHaveLength(2);
    expect(res.report.rows[0].batchNo).toBe('B-2026-NEAR');
    expect(Number(res.report.rows[0].daysRemaining)).toBeLessThanOrEqual(30);
  });

  it('20. stock_movements summarizes inbound and outbound ledger movements', () => {
    const res = runReportById('stock_movements', fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.report.rows).toHaveLength(2);
    expect(res.report.totalsRow?.delta).toBe(12); // +15 - 3
  });

  it('21. dead_stock identifies stocked SKUs with zero sales in selected period', () => {
    const res = runReportById('dead_stock', fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.report.rows).toHaveLength(1);
    expect(res.report.rows[0].sku).toBe('SKU-AUTO-24');
    expect(res.report.rows[0].tiedCapital).toBe(22_500_000); // available(3) * 7.5M cost
  });

  it('22. b2b_pipeline calculates approval rate across B2B applications', () => {
    const res = runReportById('b2b_pipeline', fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.report.rows).toHaveLength(2);
    expect(res.report.summary.find((s) => s.label.includes('نرخ تایید'))?.value).toBe(50);
  });

  it('23. top_clinics ranks customers by lifetime value (LTV)', () => {
    const res = runReportById('top_clinics', fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.report.rows[0].customerName).toBe('دکتر سارا نادری');
    expect(res.report.rows[1].customerName).toBe('کلینیک مهر');
    expect(res.report.rows[1].totalLtv).toBe(6_260_000);
  });

  it('24. customer_retention measures repeat purchase rate and days between orders', () => {
    const res = runReportById('customer_retention', fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.report.rows).toHaveLength(2);
    expect(res.report.summary.find((s) => s.label.includes('نرخ خرید تکراری'))?.value).toBe(50);
    expect(res.report.summary.find((s) => s.label.includes('میانگین دوره تکرار'))?.value).toBe(11);
  });

  it('25. support_sla measures first response minutes and resolution hours from ticket messages', () => {
    const res = runReportById('support_sla', fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.report.rows).toHaveLength(1);
    expect(res.report.rows[0].firstResponseMin).toBe(30);
    expect(res.report.rows[0].resolutionHours).toBe(2);
  });

  it('26. consultations_winrate tracks equipment consultation funnel and win rate', () => {
    const res = runReportById('consultations_winrate', fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.report.rows).toHaveLength(2);
    expect(res.report.summary.find((s) => s.label.includes('Win Rate'))?.value).toBe(50);
  });

  it('27. seo_health_audit passes real blogPosts (detects missing blog author E-E-A-T issue)', () => {
    const res = runReportById('seo_health_audit', fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const blogRule = res.report.rows.find((r) => r.ruleId === 'blog_eeat');
    expect(blogRule?.affectedCount).toBe(1);
  });

  it('28. not_found_redirects correlates 404 logs with redirect rules and flags unresolved 404s', () => {
    const res = runReportById('not_found_redirects', fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.report.rows).toHaveLength(3); // 2 404 logs + 1 redirect rule
    expect(res.report.summary.find((s) => s.label.includes('بدون ریدایرکت'))?.value).toBe(1);
  });

  it('29. catalog_qa_imed audits IMED codes, verified certs, reviews, and Q&A', () => {
    const res = runReportById('catalog_qa_imed', fixture);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.report.rows).toHaveLength(2);
    expect(res.report.summary.find((s) => s.label.includes('IMED'))?.value).toBe(50);
  });

  it('preserves full-set totalsRow while paginating rows', () => {
    const res = runReportById('sales_by_province', fixture, { page: 2, limit: 1 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.report.rows).toHaveLength(1);
    expect(res.report.page).toBe(2);
    expect(res.report.totalPages).toBe(2);
    expect(res.report.totalsRow?.ordersCount).toBe(3); // Full total, not just page 2!
  });
});

describe('Phase 5 — Express Server Reporting Endpoints & RBAC', () => {
  const realFetch = globalThis.fetch;
  let server: import('node:http').Server;
  let baseUrl = '';
  let dataDir = '';
  let stopExpiryJob: () => void = () => {};

  const TOKEN_MAP: Record<string, { uid: string; email: string; role: string }> = {
    'tok-admin': { uid: 'adm_1', email: 'admin@test.ir', role: 'admin' },
    'tok-accountant': { uid: 'adm_acc', email: 'acc@test.ir', role: 'accountant' },
    'tok-warehouse': { uid: 'adm_wh', email: 'wh@test.ir', role: 'warehouse' },
    'tok-user': { uid: 'usr_1', email: 'user@test.ir', role: '' },
  };

  beforeAll(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dental-phase5-'));
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

  it('requires admin auth (401/403) and enforces financial RBAC on gross_margin', async () => {
    const noAuth = await realFetch(`${baseUrl}/api/admin/reports`);
    expect(noAuth.status).toBe(401);

    const userRes = await realFetch(`${baseUrl}/api/admin/reports/sales_daily`, {
      headers: { Authorization: 'Bearer tok-user' },
    });
    expect(userRes.status).toBe(403);

    const whMarginRes = await realFetch(`${baseUrl}/api/admin/reports/gross_margin`, {
      headers: { Authorization: 'Bearer tok-warehouse' },
    });
    expect(whMarginRes.status).toBe(403);

    const accMarginRes = await realFetch(`${baseUrl}/api/admin/reports/gross_margin?page=1&limit=5`, {
      headers: { Authorization: 'Bearer tok-accountant' },
    });
    expect(accMarginRes.status).toBe(200);
    const json = (await accMarginRes.json()) as { ok: boolean; report: { id: string; rows: unknown[] } };
    expect(json.ok).toBe(true);
    expect(json.report.id).toBe('gross_margin');
    expect(json.report.rows.length).toBeLessThanOrEqual(5);
  });

  it('returns 404 on unknown report ID instead of falling back to raw orders', async () => {
    const res = await realFetch(`${baseUrl}/api/admin/reports/non_existent_report`, {
      headers: { Authorization: 'Bearer tok-admin' },
    });
    expect(res.status).toBe(404);
  });

  it('supports CSV export matching report columns and honors Jalali date filters', async () => {
    const csvRes = await realFetch(
      `${baseUrl}/api/admin/reports/stock_valuation?from=1400/01/01&to=1410/12/29&format=csv`,
      { headers: { Authorization: 'Bearer tok-admin' } }
    );
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers.get('content-type')).toContain('text/csv');
    const rawBytes = new Uint8Array(await csvRes.arrayBuffer());
    expect(rawBytes[0]).toBe(0xef);
    expect(rawBytes[1]).toBe(0xbb);
    expect(rawBytes[2]).toBe(0xbf);
    const text = new TextDecoder('utf-8').decode(rawBytes.slice(3));
    expect(text).toContain('انبار');
    expect(text).toContain('ارزش بهای تمام‌شده');
  });
});
