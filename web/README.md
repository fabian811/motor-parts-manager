# Motor Parts Manager (HTML, CSS and JavaScript)

This is the offline-first web/PWA implementation of Motor Parts Manager. It lives in `web/` and is separate from the native Android Studio project in `app/` at the repository root; the two apps do not share data. A web app cannot be packaged as a native APK without an additional wrapper/build process.

## Run locally

1. Install a current desktop or Android browser.
2. From a terminal, open this `web` folder and start a local server:

   ```powershell
   py -m http.server 8080
   ```

   If the Python launcher is unavailable, run `python -m http.server 8080`.
3. Open `http://localhost:8080` in your browser. The app requires `localhost` or HTTPS for Web Crypto, service workers and notification support.
4. Create a shop account. There is no seeded demo account or fabricated business data.
5. On a supported browser, use its Install app/Add to Home Screen action to install the PWA after the first visit.

On Android, publish this folder on an HTTPS host, visit it in Chrome, then use **Install app** or **Add to Home screen**. Browsers restrict background work and file access compared with a native Android application.

## Implemented

- Single local shop registration, sign-in, sign-out confirmation, PBKDF2 password hashing, and password change.
- IndexedDB data stores for users, products, sales, sale lines, stock movements, notifications and settings.
- Product search by product name, brand, part number, category, compatible vehicle and internal ID; add/edit/archive/restore.
- Stock receipts, customer returns, damaged/lost stock, positive corrections, low/out-of-stock conditions and movement audit records. Negative stock is blocked.
- POS cart, quantity validation, discount, customer details, payment selection, historical item snapshots and atomic sale/stock writes.
- Full-sale refund with retained sale history and restored stock; partial refunds are not implemented.
- Dashboard metrics from saved records; sales history with date range and search; reports for sales, inventory, movement history and complete shop, inclusive of the end date in IST.
- Receipt and report printing through the browser print dialog; select **Save as PDF** for PDF output.
- In-app stock/sales alerts, optional browser notifications, configurable notification categories and daily summary time.
- Persistent theme, accent, density, font-size, shop display name and optional shop logo settings.
- Optional six-digit UI app PIN and configurable inactivity lock; this does not encrypt browser data.
- JSON data export and restore, with a replacement warning; confirmed local-data deletion.
- Service-worker cache for the app shell and local-only UI; no third-party font or business-data service.

## Browser and deployment limits

- Business data is local to one browser profile/device. This code does not provide server authentication, cloud synchronization, remote email verification, remote recovery, database encryption, device biometrics, or cross-device backup.
- Passwords are salted PBKDF2 hashes, but IndexedDB records are not encrypted by the app. The optional six-digit app PIN is a UI lock only, not database encryption. Device/browser profile security still matters.
- A backup contains shop records and account password hashes; protect downloaded backup files.
- Browser notification permission is optional. Daily summary time is checked while the app is open or becomes visible; browsers generally do not guarantee scheduled delivery after the app/browser is closed. Use a native Android alarm/notification implementation for reliable Android scheduling.
- Reports are HTML designed for A4 printing; PDF creation and save location are provided by the browser print dialog. Browser headers/footers and page numbering are controlled by the browser.
- Product images and customizable dashboard card layout are not implemented. Email support remains deliberately disabled until a real release address is configured.
- Offline install/cache requires a first successful HTTPS/localhost visit. Browser storage can be removed by the user, browser settings or OS storage cleanup; keep backups.

## Release checklist

- [ ] Configure `SUPPORT_EMAIL` in `app.js` to a real verified support mailbox.
- [ ] Publish behind HTTPS and verify install/offline behavior on the intended browsers.
- [ ] Decide whether a native Android wrapper and Android-native scheduled notifications are required.
- [ ] Review the privacy notice, terms, data retention, backup format and jurisdiction requirements.
- [ ] Test backup/export, restore on a separate browser profile, and recovery/clear-data confirmations.
- [ ] Verify printing/PDF layout with long reports and several browsers/printers.
- [ ] Test low-stock notification permission and daily summary delivery limitations.
- [ ] Complete accessibility testing on intended browsers and mobile devices.
- [ ] Keep regular exported backups; there is no server-side copy.

## Automated/local checks

The project has no npm runtime dependencies. Run the built-in domain tests and JavaScript syntax checks with a current Node.js installation:

```powershell
node --test .\tests\domain.test.js
node --check .\app.js
node --check .\domain.js
node --check .\service-worker.js
```
