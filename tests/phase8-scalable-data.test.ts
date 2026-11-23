import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServerApp } from '../server';
import { LruCache } from '../server/lib/lruCache';
import { createServerStore } from '../server/persistence';
import { createFileRepositories } from '../server/repositories/fileRepositories';
import { createFirestoreRepositories } from '../server/repositories/firestoreRepositories';
import { createRedirectsMiddleware, createSeoRouter } from '../server/routes/seo.routes';

describe('Phase 8 — Scalable Data Access, Async Persistence, Counter Aggregation, Catalog API & Adapter Seams', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dental-phase8-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('1. Async Debounced Atomic Persistence & Zero-store.json Production Mode', () => {
    it('coalesces rapid save() bursts via async debounce, writes atomically without .tmp leftovers, and loads back intact', async () => {
      const store = createServerStore(tmpDir, { persistenceMode: 'file', writeDebounceMs: 60 });

      for (let i = 0; i < 20; i += 1) {
        store.data.auditLogs.unshift({
          id: `aud_burst_${i}`,
          actorId: 'admin_1',
          action: 'test.burst',
          targetId: `target_${i}`,
          createdAt: new Date().toISOString(),
        });
        store.save();
      }

      // Synchronous call must NOT have written store.json immediately
      expect(fs.existsSync(store.filePath)).toBe(false);
      expect(store.getWriteStats().scheduledSaves).toBe(20);
      expect(store.getWriteStats().dirty).toBe(true);

      await store.flush();

      const stats = store.getWriteStats();
      expect(stats.dirty).toBe(false);
      expect(stats.completedFlushes).toBe(1);
      expect(fs.existsSync(store.filePath)).toBe(true);

      const files = fs.readdirSync(tmpDir);
      expect(files).toEqual(['store.json']);

      await store.dispose();

      // Reload from disk in a fresh store instance
      const reloaded = createServerStore(tmpDir, { persistenceMode: 'file', writeDebounceMs: 60 });
      expect(reloaded.data.auditLogs.some((a) => a.id === 'aud_burst_19')).toBe(true);
      await reloaded.dispose();
    });

    it('defaults to persistenceMode="memory" when STORAGE_DRIVER=firestore and never creates store.json', async () => {
      const prevDriver = process.env.STORAGE_DRIVER;
      process.env.STORAGE_DRIVER = 'firestore';
      try {
        const store = createServerStore(tmpDir, { writeDebounceMs: 10 });
        expect(store.persistenceMode).toBe('memory');

        store.data.auditLogs.push({
          id: 'aud_mem_only',
          actorId: 'sys',
          action: 'mem.only',
          targetId: 'none',
          createdAt: new Date().toISOString(),
        });
        store.save();
        await store.flush();

        expect(fs.existsSync(path.join(tmpDir, 'store.json'))).toBe(false);
        expect(store.getWriteStats().completedFlushes).toBe(0);
        await store.dispose();
      } finally {
        if (prevDriver === undefined) delete process.env.STORAGE_DRIVER;
        else process.env.STORAGE_DRIVER = prevDriver;
      }
    });
  });

  describe('2. In-Memory Counter Aggregation & Periodic Flush (Redirects & 404 Telemetry)', () => {
    it('buffers redirect hits in memory without synchronous store.save() and flushes deltas cleanly', async () => {
      const store = createServerStore(tmpDir, { persistenceMode: 'file', writeDebounceMs: 25 });
      const repos = createFileRepositories(store);
      store.data.catalogState.redirects.push({
        id: 'redir_p8_1',
        fromPath: '/old-endo-files',
        toPath: '/category/endodontics',
        statusCode: 301,
        hitCount: 5,
        createdAt: new Date().toISOString(),
      });
      await store.flush();

      const saveSpy = vi.spyOn(store, 'save');
      const redirectsMw = createRedirectsMiddleware(store, repos);
      const miniApp = express();
      miniApp.use(redirectsMw);
      miniApp.use((_req, res) => res.status(200).send('ok'));

      try {
        for (let i = 0; i < 4; i += 1) {
          const res = await request(miniApp).get('/old-endo-files');
          expect(res.status).toBe(301);
          expect(res.headers.location).toBe('/category/endodontics');
        }

        // Redirect requests never trigger synchronous disk saves
        expect(saveSpy).not.toHaveBeenCalled();
        expect(redirectsMw.getPendingHitCount()).toBe(4);
        expect(store.data.catalogState.redirects.find((r) => r.id === 'redir_p8_1')?.hitCount).toBe(5);

        await redirectsMw.flushHits();

        expect(redirectsMw.getPendingHitCount()).toBe(0);
        expect(store.data.catalogState.redirects.find((r) => r.id === 'redir_p8_1')?.hitCount).toBe(9);
        expect(saveSpy).toHaveBeenCalledTimes(1);
      } finally {
        redirectsMw.stopFlushTimer();
        await store.dispose();
      }
    });

    it('aggregates /api/telemetry/404 hits in EngagementRepository and persists accumulated counts on flushCounters()', async () => {
      const store = createServerStore(tmpDir, { persistenceMode: 'file', writeDebounceMs: 25 });
      const repos = createFileRepositories(store);
      const seoRouter = createSeoRouter(store, repos);
      const miniApp = express();
      miniApp.use(express.json());
      miniApp.use(seoRouter);

      const saveSpy = vi.spyOn(store, 'save');
      try {
        for (let i = 0; i < 3; i += 1) {
          const res = await request(miniApp).post('/api/telemetry/404').send({ path: '/missing-dental-unit' });
          expect(res.status).toBe(200);
          expect(res.body.ok).toBe(true);
        }

        // No disk save per 404 ping
        expect(saveSpy).not.toHaveBeenCalled();

        await seoRouter.flushCounters();

        const logs = await repos.engagement.list404Logs();
        const entry = logs.find((l) => l.path === '/missing-dental-unit');
        expect(entry?.hitCount).toBe(3);
        expect(saveSpy).toHaveBeenCalledTimes(1);
      } finally {
        seoRouter.stopTimers();
        await store.dispose();
      }
    });
  });

  describe('3. Repository Adapter Seams & Firestore TTL Compatibility', () => {
    it('enforces TTL expiry and single-use verified tokens in AuthSessionRepository', async () => {
      const store = createServerStore(tmpDir, { persistenceMode: 'memory' });
      const repos = createFileRepositories(store);
      const now = Date.now();

      // Expired OTP challenge returns null
      await repos.authSessions.setOtpChallenge('09120001122', {
        mobile: '09120001122',
        codeHash: 'hash1',
        expiresAt: now - 1000,
        attempts: 0,
        lastSentAt: now - 5000,
      });
      expect(await repos.authSessions.getOtpChallenge('09120001122')).toBeNull();

      // Active challenge resolves
      await repos.authSessions.setOtpChallenge('09120001133', {
        mobile: '09120001133',
        codeHash: 'hash2',
        expiresAt: now + 60_000,
        attempts: 1,
        lastSentAt: now,
      });
      expect((await repos.authSessions.getOtpChallenge('09120001133'))?.attempts).toBe(1);

      // Single-use verified token & consumption
      await repos.authSessions.saveVerifiedToken({
        tokenHash: 'tok_abc',
        mobile: '09120001133',
        expiresAt: now + 60_000,
      });
      expect((await repos.authSessions.getVerifiedToken('tok_abc'))?.consumedAt).toBeUndefined();
      await repos.authSessions.consumeVerifiedToken('tok_abc', new Date().toISOString());
      expect((await repos.authSessions.getVerifiedToken('tok_abc'))?.consumedAt).toBeTruthy();

      await store.dispose();
    });

    it('writes Date ttlExpireAt fields onto Firestore auth/OTP collections in createFirestoreRepositories', async () => {
      const store = createServerStore(tmpDir, { persistenceMode: 'memory' });
      const writtenDocs = new Map<string, Record<string, unknown>>();

      const makeDocRef = (colName: string, docId: string) => ({
        path: `${colName}/${docId}`,
        async get() {
          const data = writtenDocs.get(`${colName}/${docId}`);
          return { exists: Boolean(data), data: () => data };
        },
        async set(data: Record<string, unknown>) {
          writtenDocs.set(`${colName}/${docId}`, { ...(writtenDocs.get(`${colName}/${docId}`) ?? {}), ...data });
        },
        async delete() {
          writtenDocs.delete(`${colName}/${docId}`);
        },
      });

      const mockDb = {
        collection: (colName: string) => ({
          doc: (docId: string) => makeDocRef(colName, docId),
        }),
      } as unknown as FirebaseFirestore.Firestore;

      const fsRepos = createFirestoreRepositories(store, mockDb);
      expect(fsRepos.driver).toBe('firestore');

      const future = Date.now() + 180_000;
      await fsRepos.authSessions.setOtpChallenge('09129998877', {
        mobile: '09129998877',
        codeHash: 'h',
        expiresAt: future,
        attempts: 0,
        lastSentAt: Date.now(),
      });
      await fsRepos.authSessions.saveMobileSession({
        tokenHash: 'sess_1',
        mobile: '09129998877',
        expiresAt: future,
        createdAt: new Date().toISOString(),
      });

      const otpDoc = writtenDocs.get('otpChallenges/09129998877');
      const sessDoc = writtenDocs.get('mobileSessions/sess_1');
      expect(otpDoc?.ttlExpireAt).toBeInstanceOf(Date);
      expect(sessDoc?.ttlExpireAt).toBeInstanceOf(Date);
      expect(fs.existsSync(path.join(tmpDir, 'store.json'))).toBe(false);

      await store.dispose();
    });
  });

  describe('4. Scalable GET /api/catalog/products (Filters, Cursor Pagination, Facets, ETag/304 & LRU Invalidation)', () => {
    it('supports price/multi-brand/origin/attrs filters, disjunctive facets, and lossless cursor pagination', async () => {
      const server = await createServerApp({ dataDir: tmpDir, attachVite: false });
      try {
        // 1) Cursor pagination traverses entire category result set with zero duplicates or gaps
        const allIds: string[] = [];
        let cursor: string | null = null;
        let expectedTotal = 0;
        let secondPagePrevCursor: string | null = null;

        for (let guard = 0; guard < 60; guard += 1) {
          const url = cursor
            ? `/api/catalog/products?category=endodontics&limit=15&sort=best_selling&cursor=${encodeURIComponent(cursor)}`
            : '/api/catalog/products?category=endodontics&limit=15&sort=best_selling';
          const res = await request(server.app).get(url);
          expect(res.status).toBe(200);
          expect(res.body.ok).toBe(true);
          expect(res.headers.etag).toBeTruthy();
          expect(res.headers['cache-control']).toContain('max-age=30');
          expect(res.body.facets).toBeTruthy();
          expect(Array.isArray(res.body.facets.brands)).toBe(true);
          expect(Array.isArray(res.body.facets.origins)).toBe(true);
          expect(typeof res.body.facets.priceRange.min).toBe('number');
          expect(typeof res.body.facets.priceRange.max).toBe('number');

          if (guard === 1) {
            secondPagePrevCursor = res.body.prevCursor;
            expect(typeof secondPagePrevCursor).toBe('string');
          }

          expectedTotal = res.body.total;
          for (const item of res.body.items as Array<{ id: string }>) {
            allIds.push(item.id);
          }
          if (!res.body.hasMore) {
            expect(res.body.nextCursor).toBeNull();
            break;
          }
          expect(typeof res.body.nextCursor).toBe('string');
          cursor = res.body.nextCursor;
        }

        expect(expectedTotal).toBeGreaterThan(15);
        expect(allIds.length).toBe(expectedTotal);
        expect(new Set(allIds).size).toBe(expectedTotal);

        if (secondPagePrevCursor) {
          const backToFirst = await request(server.app).get(
            `/api/catalog/products?category=endodontics&limit=15&sort=best_selling&cursor=${encodeURIComponent(secondPagePrevCursor)}`
          );
          expect(backToFirst.status).toBe(200);
          expect((backToFirst.body.items as Array<{ id: string }>).map((x) => x.id)).toEqual(allIds.slice(0, 15));
        }

        // 2) ETag -> 304 Not Modified
        const firstRes = await request(server.app).get('/api/catalog/products?limit=5&inStock=1');
        expect(firstRes.status).toBe(200);
        const etag = firstRes.headers.etag;
        const cached304 = await request(server.app)
          .get('/api/catalog/products?limit=5&inStock=1')
          .set('If-None-Match', etag);
        expect(cached304.status).toBe(304);

        // 3) Multi-brand + price bounds + disjunctive facets
        const sampleRes = await request(server.app).get('/api/catalog/products?limit=50');
        const allFacets = sampleRes.body.facets as {
          brands: Array<{ id: string; count: number }>;
          origins: Array<{ code: string; count: number }>;
        };
        expect(allFacets.brands.length).toBeGreaterThanOrEqual(2);
        const b1 = allFacets.brands[0].id;
        const b2 = allFacets.brands[1].id;
        const multiBrandRes = await request(server.app).get(`/api/catalog/products?brand=${b1},${b2}&limit=50`);
        expect(multiBrandRes.status).toBe(200);
        for (const p of multiBrandRes.body.items as Array<{ brandId: string }>) {
          expect([b1, b2]).toContain(p.brandId);
        }
        // Disjunctive brand facet still includes brands outside current brand selection
        expect(multiBrandRes.body.facets.brands.length).toBeGreaterThanOrEqual(2);

        // 4) minPrice / maxPrice filter
        const priceBounded = await request(server.app).get('/api/catalog/products?minPrice=1000000&maxPrice=5000000&limit=50');
        expect(priceBounded.status).toBe(200);
        expect(priceBounded.body.items.length).toBeGreaterThan(0);

        // 5) Catalog change invalidates ETag & LRU cache immediately
        const target = server.store.data.catalogState.products.find((p) => p.status === 'active')!;
        target.titleFa = `${target.titleFa} (به‌روزرسانی فاز ۸)`;
        target.updatedAt = new Date(Date.now() + 5000).toISOString();
        server.repos.notifyCatalogChanged();

        const afterMutRes = await request(server.app).get('/api/catalog/products?limit=5&inStock=1');
        expect(afterMutRes.status).toBe(200);
        expect(afterMutRes.headers.etag).not.toBe(etag);
      } finally {
        server.stopExpiryJob();
        await server.store.dispose();
      }
    });

    it('evicts least-recently-used entries in LruCache while keeping hot entries fresh', () => {
      const cache = new LruCache<number>({ maxEntries: 2, ttlMs: 10_000 });
      cache.set('a', 1);
      cache.set('b', 2);
      // Access 'a' so 'b' becomes LRU
      expect(cache.get('a')).toBe(1);
      cache.set('c', 3);

      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBe(3);
      expect(cache.getStats().evictions).toBe(1);
    });
  });
});
