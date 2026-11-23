import crypto from 'node:crypto';
import express from 'express';
import type { ProformaInvoice, RfqRequest } from '../../src/types/domain';
import { normalizeMobile, resolveMobileSession } from '../auth';
import { verifyFirebaseAdmin, verifyFirebaseUser } from '../lib/adminAuth';
import type { ServerStore } from '../persistence';
import type { RepositoryBundle } from '../repositories';
import { createFileRepositories } from '../repositories/fileRepositories';
import {
  parseRequestBody,
  parseRequestQuery,
  rfqConvertBodySchema,
  rfqCreateBodySchema,
  rfqListQuerySchema,
  rfqMessageBodySchema,
  rfqQuoteBodySchema,
  rfqRespondBodySchema,
} from '../validation';

export function createRfqRouter(store: ServerStore, repos?: RepositoryBundle): express.Router {
  const router = express.Router();
  const activeRepos = repos ?? createFileRepositories(store);

  router.get('/api/rfq', async (req, res) => {
    const query = parseRequestQuery(rfqListQuerySchema, req, res);
    if (!query) return;

    const mob = await resolveMobileSession(activeRepos, req);
    const fbUser = await verifyFirebaseUser(req);
    const adminCheck = fbUser ? await verifyFirebaseAdmin(req, 'rfq:read_all') : null;
    const isAdmin = Boolean(adminCheck && !('errorStatus' in adminCheck));

    const all = await activeRepos.rfqs.list({ status: query.status });
    const slice = (items: RfqRequest[]) => (query.limit ? items.slice(0, query.limit) : items);

    if (isAdmin) {
      return res.json({ ok: true, rfqs: slice(all) });
    }
    if (fbUser) {
      return res.json({ ok: true, rfqs: slice(all.filter((r) => r.userId === fbUser.uid)) });
    }
    if (mob) {
      return res.json({ ok: true, rfqs: slice(all.filter((r) => normalizeMobile(r.customerMobile) === mob.mobile)) });
    }
    return res.status(401).json({ ok: false, message: 'برای مشاهده درخواست‌های استعلام قیمت احراز هویت الزامی است.' });
  });

  router.post('/api/rfq', async (req, res) => {
    const parsed = parseRequestBody(rfqCreateBodySchema, req, res);
    if (!parsed) return;

    const mob = await resolveMobileSession(activeRepos, req);
    const fbUser = await verifyFirebaseUser(req);

    const productId = parsed.productId;
    const variantId = parsed.variantId;
    const quantity = parsed.quantity;
    const customerName = String(parsed.customerName || fbUser?.displayName || mob?.displayName || '').trim().slice(0, 120);
    const customerMobile = normalizeMobile(String(parsed.customerMobile || mob?.mobile || ''));
    const clinicName = parsed.clinicName;
    const note = parsed.note;
    const targetUnitPrice = parsed.targetUnitPrice;

    const catalog = await activeRepos.catalog.getSnapshot();
    const product = catalog.products.find((p) => p.id === productId);
    const variant = product?.variants.find((v) => v.id === variantId) ?? product?.variants[0];
    if (!product || !variant) {
      return res.status(400).json({ ok: false, message: 'محصول انتخاب‌شده یافت نشد.' });
    }
    if (!customerName || !/^09\d{9}$/.test(customerMobile)) {
      return res.status(400).json({ ok: false, message: 'نام و شماره موبایل معتبر الزامی است.' });
    }

    const now = new Date().toISOString();
    const rfq: RfqRequest = {
      id: `rfq_${crypto.randomBytes(6).toString('hex')}`,
      rfqNo: `RFQ-${crypto.randomInt(10000, 100000)}`,
      userId: fbUser?.uid || (mob ? `mobile:${mob.mobile}` : `mobile:${customerMobile}`),
      customerMobile,
      customerName,
      clinicName,
      productId: product.id,
      productTitleFa: product.titleFa,
      variantId: variant.id,
      variantLabelFa: variant.labelFa,
      quantity,
      targetUnitPrice,
      status: 'submitted',
      messages: [
        {
          id: `rfqm_${crypto.randomBytes(5).toString('hex')}`,
          authorName: customerName,
          isStaff: false,
          body: note || `درخواست استعلام قیمت برای ${quantity} عدد ${product.titleFa}`,
          proposedUnitPrice: targetUnitPrice,
          createdAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    await activeRepos.rfqs.save(rfq);

    return res.json({ ok: true, rfq });
  });

  router.post('/api/rfq/:id/messages', async (req, res) => {
    const rfq = await activeRepos.rfqs.getById(String(req.params.id || ''));
    if (!rfq) return res.status(404).json({ ok: false, message: 'درخواست استعلام قیمت یافت نشد.' });

    const mob = await resolveMobileSession(activeRepos, req);
    const fbUser = await verifyFirebaseUser(req);
    const adminCheck = fbUser ? await verifyFirebaseAdmin(req, 'rfq:quote') : null;
    const isAdmin = Boolean(adminCheck && !('errorStatus' in adminCheck));
    const isOwner = Boolean(
      (fbUser && rfq.userId === fbUser.uid) || (mob && normalizeMobile(rfq.customerMobile) === mob.mobile)
    );

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ ok: false, message: 'دسترسی به این درخواست استعلام قیمت ندارید.' });
    }

    const parsed = parseRequestBody(rfqMessageBodySchema, req, res);
    if (!parsed) return;

    const now = new Date().toISOString();
    const prevStatus = rfq.status;
    rfq.messages.push({
      id: `rfqm_${crypto.randomBytes(5).toString('hex')}`,
      authorName: isAdmin ? 'کارشناس فروش کلینیکی' : rfq.customerName,
      isStaff: isAdmin,
      body: parsed.body,
      proposedUnitPrice: parsed.proposedUnitPrice,
      createdAt: now,
    });
    if (isAdmin && rfq.status === 'submitted') rfq.status = 'in_review';
    rfq.updatedAt = now;
    await activeRepos.rfqs.save(rfq);

    if (isAdmin && adminCheck && !('errorStatus' in adminCheck) && repos) {
      await repos.audit.append({
        id: `aud_${crypto.randomBytes(6).toString('hex')}`,
        actorType: 'admin',
        actorId: adminCheck.user.uid,
        actorEmail: adminCheck.user.email || adminCheck.user.uid,
        action: 'rfq.staff_message',
        entityType: 'rfq',
        entityId: rfq.id,
        summary: `Staff replied on RFQ ${rfq.rfqNo}`,
        before: { status: prevStatus },
        after: { status: rfq.status },
        createdAt: now,
      });
    }

    return res.json({ ok: true, rfq });
  });

  router.post('/api/rfq/:id/quote', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req, 'rfq:quote');
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }

    const rfq = await activeRepos.rfqs.getById(String(req.params.id || ''));
    if (!rfq) return res.status(404).json({ ok: false, message: 'درخواست استعلام قیمت یافت نشد.' });

    const parsed = parseRequestBody(rfqQuoteBodySchema, req, res);
    if (!parsed) return;

    const { quotedUnitPrice, validDays, note } = parsed;
    const beforeState = { status: rfq.status, quotedUnitPrice: rfq.quotedUnitPrice ?? null };

    const now = new Date().toISOString();
    rfq.quotedUnitPrice = quotedUnitPrice;
    rfq.quotedTotal = quotedUnitPrice * rfq.quantity;
    rfq.validUntil = new Date(Date.now() + validDays * 86400000).toISOString();
    rfq.status = 'quoted';
    rfq.messages.push({
      id: `rfqm_${crypto.randomBytes(5).toString('hex')}`,
      authorName: adminCheck.user.displayName || adminCheck.user.email,
      isStaff: true,
      body: note || `قیمت پیشنهادی واحد ${quotedUnitPrice.toLocaleString()} تومان (جمع ${rfq.quotedTotal.toLocaleString()} تومان) ثبت شد.`,
      proposedUnitPrice: quotedUnitPrice,
      createdAt: now,
    });
    rfq.updatedAt = now;
    await activeRepos.rfqs.save(rfq);

    if (repos) {
      await repos.audit.append({
        id: `aud_${crypto.randomBytes(6).toString('hex')}`,
        actorType: 'admin',
        actorId: adminCheck.user.uid,
        actorEmail: adminCheck.user.email || adminCheck.user.uid,
        action: 'rfq.quoted',
        entityType: 'rfq',
        entityId: rfq.id,
        summary: `Quoted RFQ ${rfq.rfqNo} at ${quotedUnitPrice} unitPrice`,
        before: beforeState,
        after: { status: rfq.status, quotedUnitPrice: rfq.quotedUnitPrice, quotedTotal: rfq.quotedTotal },
        createdAt: now,
      });
    }

    return res.json({ ok: true, rfq });
  });

  router.post('/api/rfq/:id/respond', async (req, res) => {
    const rfq = await activeRepos.rfqs.getById(String(req.params.id || ''));
    if (!rfq) return res.status(404).json({ ok: false, message: 'درخواست استعلام قیمت یافت نشد.' });

    const mob = await resolveMobileSession(activeRepos, req);
    const fbUser = await verifyFirebaseUser(req);
    const isOwner = Boolean(
      (fbUser && rfq.userId === fbUser.uid) || (mob && normalizeMobile(rfq.customerMobile) === mob.mobile)
    );
    if (!isOwner) {
      return res.status(403).json({ ok: false, message: 'فقط ثبت‌کننده درخواست مجاز به تایید یا رد پیشنهاد است.' });
    }

    const parsed = parseRequestBody(rfqRespondBodySchema, req, res);
    if (!parsed) return;

    if (rfq.status !== 'quoted') {
      return res.status(400).json({ ok: false, message: 'پیشنهاد قیمتی فعالی برای پاسخ وجود ندارد.' });
    }

    const { decision } = parsed;
    const now = new Date().toISOString();
    rfq.status = decision;
    rfq.messages.push({
      id: `rfqm_${crypto.randomBytes(5).toString('hex')}`,
      authorName: rfq.customerName,
      isStaff: false,
      body: decision === 'accepted' ? 'قیمت پیشنهادی توسط مشتری تایید شد.' : 'پیشنهاد قیمت توسط مشتری رد شد.',
      createdAt: now,
    });
    rfq.updatedAt = now;
    await activeRepos.rfqs.save(rfq);

    return res.json({ ok: true, rfq });
  });

  router.post('/api/rfq/:id/convert', async (req, res) => {
    const adminCheck = await verifyFirebaseAdmin(req, 'rfq:convert');
    if ('errorStatus' in adminCheck) {
      return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
    }

    const rfq = await activeRepos.rfqs.getById(String(req.params.id || ''));
    if (!rfq) return res.status(404).json({ ok: false, message: 'درخواست استعلام قیمت یافت نشد.' });

    const parsed = parseRequestBody(rfqConvertBodySchema, req, res);
    if (!parsed) return;

    const unitPrice = rfq.quotedUnitPrice || rfq.targetUnitPrice || 0;
    if (unitPrice <= 0) {
      return res.status(400).json({ ok: false, message: 'ابتدا باید قیمت واحد پیشنهادی ثبت شود.' });
    }

    const catalog = await activeRepos.catalog.getSnapshot();
    const beforeState = { status: rfq.status, proformaId: rfq.proformaId ?? null };
    const now = new Date().toISOString();
    const subtotal = unitPrice * rfq.quantity;
    const taxTotal = Math.round((subtotal * catalog.settings.taxRatePercent) / 100);
    const proforma: ProformaInvoice = {
      id: `pf_rfq_${crypto.randomBytes(5).toString('hex')}`,
      proformaNo: `PF-${crypto.randomInt(10000, 100000)}`,
      shareToken: crypto.randomBytes(16).toString('hex'),
      userId: rfq.userId,
      contactName: rfq.customerName,
      contactMobile: rfq.customerMobile,
      clinicName: rfq.clinicName,
      status: 'sent',
      subtotal,
      discountTotal: 0,
      taxTotal,
      grandTotal: subtotal + taxTotal,
      items: [
        {
          productId: rfq.productId,
          variantId: rfq.variantId,
          sku: catalog.products.find((p) => p.id === rfq.productId)?.sku || 'RFQ-SKU',
          titleFa: rfq.productTitleFa,
          variantLabelFa: rfq.variantLabelFa,
          quantity: rfq.quantity,
          unitPrice,
          discountAmount: 0,
          lineTotal: subtotal,
          priceSource: 'contract',
        },
      ],
      termsFa: `تبدیل‌شده از استعلام قیمت ${rfq.rfqNo}.`,
      validUntil: rfq.validUntil || new Date(Date.now() + 7 * 86400000).toISOString(),
      createdAt: now,
      updatedAt: now,
    };

    rfq.status = 'converted';
    rfq.proformaId = proforma.id;
    rfq.updatedAt = now;
    await activeRepos.proformas.save(proforma);
    await activeRepos.rfqs.save(rfq);
    await activeRepos.audit.append({
      id: `aud_${crypto.randomBytes(6).toString('hex')}`,
      actorType: 'admin',
      actorId: adminCheck.user.uid,
      actorEmail: adminCheck.user.email || adminCheck.user.uid,
      action: 'rfq.converted_to_proforma',
      entityType: 'rfq',
      entityId: rfq.id,
      summary: `Converted RFQ ${rfq.rfqNo} to proforma ${proforma.proformaNo}`,
      before: beforeState,
      after: { status: rfq.status, proformaId: proforma.id },
      createdAt: now,
    });

    return res.json({ ok: true, rfq, proforma });
  });

  return router;
}
