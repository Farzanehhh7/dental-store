import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { resolveMobileSession, verifyFirebaseUser } from '../auth';
import { validateServerEnv } from '../config/env';
import { verifyFirebaseAdmin } from '../lib/adminAuth';
import type { ServerStore, UploadedFileRecord } from '../persistence';
import type { RepositoryBundle } from '../repositories';
import { createFileRepositories } from '../repositories/fileRepositories';
import { fileUploadJsonBodySchema, parseRequestBody } from '../validation';

const ALLOWED_EXTENSION_MAP: Record<
  string,
  { mime: string; canonicalExt: '.png' | '.jpg' | '.webp' | '.pdf' }
> = {
  '.png': { mime: 'image/png', canonicalExt: '.png' },
  '.jpg': { mime: 'image/jpeg', canonicalExt: '.jpg' },
  '.jpeg': { mime: 'image/jpeg', canonicalExt: '.jpg' },
  '.webp': { mime: 'image/webp', canonicalExt: '.webp' },
  '.pdf': { mime: 'application/pdf', canonicalExt: '.pdf' },
};

function sniffMimeFromMagicBytes(buf: Buffer): string | null {
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }
  return null;
}

function isSafeRedirectTarget(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/api/files/')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function resolveUploadsDir(dataDir?: string): string {
  const baseDir = dataDir || process.env.DATA_DIR || path.resolve(process.cwd(), '.data');
  return path.resolve(baseDir, 'uploads');
}

export function createFilesRouter(
  store: ServerStore,
  options?: { dataDir?: string; repos?: RepositoryBundle }
): express.Router {
  const router = express.Router();
  const uploadJsonParser = express.json({ limit: '8mb' });
  const activeRepos = options?.repos ?? createFileRepositories(store);

  // --- Honest Regulatory / Technical Certificate Lookup & Download ---
  router.get('/api/files/certificate', async (req, res) => {
    const productIdParam = String(req.query.productId || '').trim();
    const skuParam = String(req.query.sku || '').trim();
    const fileIdParam = String(req.query.fileId || '').trim();
    const catalog = options?.repos ? await options.repos.catalog.getSnapshot() : store.data.catalogState;

    const product = catalog.products.find(
      (p) =>
        (productIdParam && p.id === productIdParam) ||
        (skuParam && (p.sku === skuParam || p.variants.some((v) => v.sku === skuParam)))
    );

    if (!product) {
      return res.status(404).json({ ok: false, message: 'محصول یا مدرک فنی درخواستی یافت نشد.' });
    }

    const fileRecord =
      product.files?.find((f) => (fileIdParam ? f.id === fileIdParam : true)) || product.files?.[0];

    if (fileRecord?.isVerified && fileRecord.fileUrl && isSafeRedirectTarget(fileRecord.fileUrl)) {
      return res.redirect(302, fileRecord.fileUrl);
    }

    const safeSku = product.sku.replace(/[^a-zA-Z0-9_\-]/g, '');
    const verificationStatus = fileRecord?.isVerified
      ? `VERIFIED REGISTRY RECORD (${fileRecord.issuer || 'Official Manufacturer / Regulator'})`
      : 'UNVERIFIED PRODUCT INFORMATION SHEET — NOT AN OFFICIAL CE / ISO / IMED CERTIFICATE';

    const docBody = [
      'DENTALMARKET PRODUCT DOCUMENTATION & REGULATORY NOTICE',
      '======================================================',
      `Status         : ${verificationStatus}`,
      `Product Title  : ${product.titleEn} (${product.titleFa})`,
      `SKU            : ${product.sku}`,
      `IMED Code      : ${product.imedCode || 'Not registered'}`,
      `Document Title : ${fileRecord?.titleFa || 'مشخصات فنی محصول'}`,
      `Document Code  : ${fileRecord?.code || 'N/A'}`,
      `Verification   : ${fileRecord?.isVerified ? 'Verified file metadata on record' : 'No verified certificate URL uploaded yet'}`,
      `Issuer         : ${fileRecord?.issuer || 'Catalog Technical Metadata'}`,
      `Generated At   : ${new Date().toISOString()}`,
      '',
      'Clinical Storage & Handling Guidance:',
      '- Follow manufacturer IFU inside packaging.',
      '- Inspect FEFO batch expiry before clinical use.',
      `- Customer & Technical Support: ${catalog.settings.phone}`,
    ].join('\n');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="${safeSku}-documentation.txt"`);
    return res.send(docBody);
  });

  // --- Hardened File Upload (Magic-Byte Sniffing, Extension Allowlist, Size Cap, CSPRNG Filename) ---
  router.post('/api/files/upload', uploadJsonParser, async (req, res) => {
    const bodyCheck = parseRequestBody(fileUploadJsonBodySchema, req, res);
    if (!bodyCheck) return;

    const fbUser = await verifyFirebaseUser(req);
    const mobSession = await resolveMobileSession(activeRepos, req);
    let actorUid = fbUser?.uid || (mobSession ? `mobile:${mobSession.mobile}` : '');
    let actorEmail = fbUser?.email || actorUid;

    if (bodyCheck.purpose === 'b2b_doc') {
      if (!fbUser && !mobSession) {
        return res.status(401).json({ ok: false, message: 'برای بارگذاری مدارک صنفی باید وارد حساب شوید.' });
      }
    } else {
      const adminCheck = await verifyFirebaseAdmin(req, 'files:upload_catalog');
      if ('errorStatus' in adminCheck) {
        return res.status(adminCheck.errorStatus).json({ ok: false, message: adminCheck.message });
      }
      actorUid = adminCheck.user.uid;
      actorEmail = adminCheck.user.email || adminCheck.user.uid;
    }

    const rawName = bodyCheck.filename.trim();
    if (rawName.includes('..') || rawName.includes('/') || rawName.includes('\\') || rawName.includes('\0')) {
      return res.status(400).json({ ok: false, message: 'نام فایل دارای کاراکترهای غیرمجاز است.' });
    }
    const baseName = path.basename(rawName);
    const ext = path.extname(baseName).toLowerCase();
    const extRule = ALLOWED_EXTENSION_MAP[ext];
    if (!extRule) {
      return res.status(400).json({
        ok: false,
        message: 'فقط فایل‌های تصویری PNG، JPG، WEBP یا سند PDF مجاز هستند.',
      });
    }

    const base64Clean = bodyCheck.dataBase64.replace(/^data:[^;]+;base64,/i, '').trim();
    if (!/^[A-Za-z0-9+/=]+$/.test(base64Clean)) {
      return res.status(400).json({ ok: false, message: 'فرمت Base64 فایل نامعتبر است.' });
    }

    const env = validateServerEnv(process.env);
    const buf = Buffer.from(base64Clean, 'base64');
    if (buf.length === 0) {
      return res.status(400).json({ ok: false, message: 'فایل خالی قابل بارگذاری نیست.' });
    }
    if (buf.length > env.UPLOAD_MAX_BYTES) {
      return res.status(413).json({ ok: false, message: 'حجم فایل بیش از سقف مجاز سرور است.' });
    }

    const sniffedMime = sniffMimeFromMagicBytes(buf);
    if (!sniffedMime || sniffedMime !== extRule.mime) {
      return res.status(400).json({
        ok: false,
        message: 'محتوای واقعی فایل با پسوند اعلام‌شده مطابقت ندارد و رد شد.',
      });
    }

    const uploadDir = resolveUploadsDir(options?.dataDir);
    await fs.promises.mkdir(uploadDir, { recursive: true });
    const fileId = `fil_${crypto.randomBytes(8).toString('hex')}`;
    const storedName = `${crypto.randomUUID()}${extRule.canonicalExt}`;
    const resolvedTarget = path.resolve(uploadDir, storedName);
    if (!resolvedTarget.startsWith(uploadDir + path.sep)) {
      return res.status(400).json({ ok: false, message: 'مسیر ذخیره‌سازی نامعتبر است.' });
    }

    await fs.promises.writeFile(resolvedTarget, buf);
    const record: UploadedFileRecord = {
      id: fileId,
      storedName,
      originalName: baseName.slice(0, 120),
      mimeType: sniffedMime,
      sizeBytes: buf.length,
      purpose: bodyCheck.purpose,
      ownerUid: actorUid,
      createdAt: new Date().toISOString(),
    };
    await activeRepos.engagement.saveUploadedFile(record);

    if (bodyCheck.purpose !== 'b2b_doc' && options?.repos) {
      await options.repos.audit.append({
        id: `aud_${crypto.randomBytes(6).toString('hex')}`,
        actorType: 'admin',
        actorId: actorUid,
        actorEmail,
        action: 'file.uploaded',
        entityType: 'file',
        entityId: fileId,
        summary: `Uploaded ${sniffedMime} (${buf.length} bytes) for ${bodyCheck.purpose}`,
        after: { fileId, mimeType: sniffedMime, sizeBytes: buf.length, purpose: bodyCheck.purpose },
        createdAt: record.createdAt,
      });
    }

    return res.status(201).json({
      ok: true,
      file: {
        id: record.id,
        url: `/api/files/download/${record.id}`,
        mimeType: record.mimeType,
        sizeBytes: record.sizeBytes,
        purpose: record.purpose,
        createdAt: record.createdAt,
      },
    });
  });

  // --- Hardened File Download (ID Validation + Path Confinement + Ownership Check for B2B Docs) ---
  router.get('/api/files/download/:fileId', async (req, res) => {
    const fileId = String(req.params.fileId || '').trim();
    if (!/^[a-zA-Z0-9_\-]+$/.test(fileId)) {
      return res.status(400).json({ ok: false, message: 'شناسه فایل نامعتبر است.' });
    }

    const record = await activeRepos.engagement.getUploadedFile(fileId);
    if (!record) {
      return res.status(404).json({ ok: false, message: 'فایل درخواستی یافت نشد.' });
    }

    if (record.purpose === 'b2b_doc') {
      const fbUser = await verifyFirebaseUser(req);
      const mobSession = await resolveMobileSession(activeRepos, req);
      const adminCheck = fbUser ? await verifyFirebaseAdmin(req, 'users:manage_group') : null;
      const isAdmin = Boolean(adminCheck && !('errorStatus' in adminCheck));
      const callerUid = fbUser?.uid || (mobSession ? `mobile:${mobSession.mobile}` : '');
      if (!isAdmin && callerUid !== record.ownerUid) {
        return res.status(callerUid ? 403 : 401).json({ ok: false, message: 'دسترسی به این مدرک مجاز نیست.' });
      }
    }

    const uploadDir = resolveUploadsDir(options?.dataDir);
    const resolvedTarget = path.resolve(uploadDir, record.storedName);
    if (!resolvedTarget.startsWith(uploadDir + path.sep) || !fs.existsSync(resolvedTarget)) {
      return res.status(404).json({ ok: false, message: 'فایل روی دیسک یافت نشد.' });
    }

    res.setHeader('Content-Type', record.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `${record.mimeType === 'application/pdf' ? 'attachment' : 'inline'}; filename="${record.storedName}"`
    );
    return res.sendFile(resolvedTarget);
  });

  return router;
}
