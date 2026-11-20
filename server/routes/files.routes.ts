import express from 'express';
import type { ServerStore } from '../persistence';

export function createFilesRouter(store: ServerStore): express.Router {
  const router = express.Router();

  // --- Honest Regulatory / Technical Certificate Lookup & Download ---
  router.get('/api/files/certificate', (req, res) => {
    const productIdParam = String(req.query.productId || '').trim();
    const skuParam = String(req.query.sku || '').trim();
    const fileIdParam = String(req.query.fileId || '').trim();
    const catalog = store.data.catalogState;

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

    if (fileRecord?.isVerified && fileRecord.fileUrl) {
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
    res.setHeader('Content-Disposition', `attachment; filename="${safeSku}-documentation.txt"`);
    return res.send(docBody);
  });

  return router;
}
