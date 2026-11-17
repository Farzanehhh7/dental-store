# Firestore Security Specification (`security_spec.md`)

## 1. Data Invariants
1. Public storefront catalog (`categories`, `brands`, `attributes`, `products`, `campaigns`, `bundles`, `agents`, `blogPosts`) can only be mutated by verified Admin users (`isAdmin()`).
2. Private customer documents (`orders`, `proformas`, `paymentPlans`, `tickets`, `b2bVerifications`, `users`) are strictly readable/writable only by their authenticated, email-verified owner (`resource.data.userId == request.auth.uid`) or an Admin (`isAdmin()`).
3. Users cannot self-elevate RBAC roles, customer group (`customerGroup`), or `b2bStatus` to `approved`, nor bypass state machines on `orders` or `reviews` (`status` must start as `'pending_payment'` / `'pending'`).
4. `auditLogs` are append-only by admins and immutable (`allow update, delete: if false`).
5. Every string field enforces `.size()` bounds, every document ID enforces `^[a-zA-Z0-9_\-]+$`, and every `create`/`update` validates `request.time` timestamps and strict key allowlists (`hasAll` + `hasOnly` / `affectedKeys().hasOnly`).

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Product Mutation**: Anonymous write to `/products/prod-1` -> DENIED.
2. **Shadow Field Injection on User Profile**: Authenticated user sends `{ uid, customerGroup: "retail", accountType: "clinic", b2bStatus: "none", isAdmin: true, createdAt, updatedAt }` to `/users/{uid}` -> DENIED (`hasOnly` rejects `isAdmin`).
3. **Self-Privilege Escalation (Customer Group)**: User updates `/users/{uid}` changing `customerGroup` from `"retail"` to `"wholesale"` -> DENIED (`affectedKeys().hasOnly(...)` blocks `customerGroup`).
4. **Cross-User Order Read (IDOR)**: User A tries `get(/orders/order-of-user-b)` -> DENIED (`resource.data.userId == request.auth.uid` fails).
5. **Order Status Shortcutting**: User creates `/orders/ord-1` with `status: "paid"` and `paymentStatus: "paid"` -> DENIED (must be `"pending_payment"` / `"unpaid"`).
6. **Review Auto-Approval Bypass**: User creates `/reviews/rev-1` with `status: "approved"` -> DENIED (must be `"pending"`).
7. **Unverified Email Spoof**: User with `email: "farina.connect@gmail.com"` and `email_verified: false` tries admin write -> DENIED (`email_verified == true` required).
8. **ID Poisoning**: Creating `/orders/<2KB string>` -> DENIED (`isValidId` max 128 chars regex fails).
9. **Timestamp Forgery**: Creating `/tickets/t-1` with backdated `createdAt` != `request.time` -> DENIED.
10. **Audit Log Tampering**: Admin attempts `update` or `delete` on `/auditLogs/log-1` -> DENIED.
11. **Admin Registry Escalation**: Non-super-admin attempts write to `/admins/hacker-uid` -> DENIED.
12. **Blanket Collection Scraping**: Non-admin executes `list` on `/users` -> DENIED (`allow list: if isAdmin()`).
