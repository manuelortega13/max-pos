// MaxPOS receipt-printer helper.
//
// Tiny HTTP service that turns a JSON receipt POST from the PWA into
// raw ESC/POS bytes and writes them directly to the local thermal
// printer. Bypasses the browser print pipeline entirely so there's
// no print dialog flash and no driver-mediated codepage drift.
//
// Cross-platform via direct file I/O:
//   - Linux / macOS: writes to /dev/usb/lp0 (or whatever PRINTER_DEVICE points to).
//   - Windows: writes to the UNC printer path "\\.\<queue-name>" which
//     the print spooler accepts as a RAW byte stream when the queue is
//     a raw queue.
//
// Zero npm deps on purpose — Node built-ins only. Run with `node index.js`.
//
// Configuration via environment variables:
//   PORT            HTTP port to listen on. Default 9100.
//   PRINTER_DEVICE  Path the bytes get written to. Default /dev/usb/lp0
//                   on Linux/macOS, \\.\XP58 on Windows.
//   PAPER_WIDTH     Columns per line. Default 32 (matches 58mm thermal
//                   at the printer's default Font A). Bump to 48 for 80mm.

import http from 'node:http';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

const PORT = Number(process.env.PORT ?? 9100);
const PRINTER_DEVICE =
  process.env.PRINTER_DEVICE ??
  (os.platform() === 'win32' ? '\\\\.\\XP58' : '/dev/usb/lp0');
const PAPER_WIDTH = Number(process.env.PAPER_WIDTH ?? 32);

const SERVICE_NAME = 'maxpos-print-helper';

function doInstall() {
  const platform = os.platform();
  const exePath = process.execPath;
  console.log(`Registering auto-start for: ${exePath}`);
  try {
    if (platform === 'linux') installLinux(exePath);
    else if (platform === 'win32') installWindows(exePath);
    else if (platform === 'darwin') installMac(exePath);
    else {
      console.error(`Auto-install not supported on platform: ${platform}`);
      process.exit(1);
    }
    console.log(
      `\nInstalled. The helper will start automatically on every ` +
        `${platform === 'win32' ? 'login' : 'boot/login'}.`,
    );
  } catch (err) {
    console.error('Install failed:', err?.message ?? err);
    process.exit(1);
  }
}

function doUninstall() {
  const platform = os.platform();
  try {
    if (platform === 'linux') uninstallLinux();
    else if (platform === 'win32') uninstallWindows();
    else if (platform === 'darwin') uninstallMac();
    else {
      console.error(`Auto-uninstall not supported on platform: ${platform}`);
      process.exit(1);
    }
    console.log('Uninstalled. Auto-start removed.');
  } catch (err) {
    console.error('Uninstall failed:', err?.message ?? err);
    process.exit(1);
  }
}

// ────── Linux: systemd user unit ──────
function linuxUnitPath() {
  return path.join(os.homedir(), '.config/systemd/user', `${SERVICE_NAME}.service`);
}
function installLinux(exePath) {
  const unitPath = linuxUnitPath();
  fsSync.mkdirSync(path.dirname(unitPath), { recursive: true });
  const unit = `[Unit]
Description=MaxPOS print helper (HTTP -> ESC/POS bridge)
After=network.target

[Service]
Type=simple
ExecStart=${exePath}
Environment=PORT=${PORT}
Environment=PRINTER_DEVICE=${PRINTER_DEVICE}
Environment=PAPER_WIDTH=${PAPER_WIDTH}
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
`;
  fsSync.writeFileSync(unitPath, unit);
  execSync('systemctl --user daemon-reload', { stdio: 'inherit' });
  execSync(`systemctl --user enable --now ${SERVICE_NAME}`, { stdio: 'inherit' });
  console.log(`Wrote unit: ${unitPath}`);
  console.log(
    'Tip: run `loginctl enable-linger $USER` once to keep the helper ' +
      'running when no user is logged into the console.',
  );
}
function uninstallLinux() {
  const unitPath = linuxUnitPath();
  try {
    execSync(`systemctl --user disable --now ${SERVICE_NAME}`, { stdio: 'inherit' });
  } catch {
    // service might already be stopped — ignore
  }
  if (fsSync.existsSync(unitPath)) {
    fsSync.unlinkSync(unitPath);
    console.log(`Removed unit: ${unitPath}`);
  }
  execSync('systemctl --user daemon-reload', { stdio: 'inherit' });
}

// ────── Windows: HKCU Run key ──────
const WIN_REG_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const WIN_REG_VALUE = 'MaxPOSPrintHelper';
function installWindows(exePath) {
  execSync(
    `reg add "${WIN_REG_KEY}" /v ${WIN_REG_VALUE} /t REG_SZ /d "\\"${exePath}\\"" /f`,
    { stdio: 'inherit' },
  );
  console.log(`Wrote Run entry: ${WIN_REG_KEY}\\${WIN_REG_VALUE}`);
}
function uninstallWindows() {
  execSync(`reg delete "${WIN_REG_KEY}" /v ${WIN_REG_VALUE} /f`, { stdio: 'inherit' });
}

// ────── macOS: LaunchAgent ──────
function macPlistPath() {
  return path.join(os.homedir(), 'Library/LaunchAgents', `com.maxpos.print-helper.plist`);
}
function installMac(exePath) {
  const plistPath = macPlistPath();
  fsSync.mkdirSync(path.dirname(plistPath), { recursive: true });
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.maxpos.print-helper</string>
  <key>ProgramArguments</key>
  <array><string>${exePath}</string></array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key><string>${PORT}</string>
    <key>PRINTER_DEVICE</key><string>${PRINTER_DEVICE}</string>
    <key>PAPER_WIDTH</key><string>${PAPER_WIDTH}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
`;
  fsSync.writeFileSync(plistPath, plist);
  // Unload first in case it was previously registered, then load.
  try { execSync(`launchctl unload "${plistPath}"`, { stdio: 'ignore' }); } catch {}
  execSync(`launchctl load "${plistPath}"`, { stdio: 'inherit' });
  console.log(`Wrote LaunchAgent: ${plistPath}`);
}
function uninstallMac() {
  const plistPath = macPlistPath();
  try { execSync(`launchctl unload "${plistPath}"`, { stdio: 'ignore' }); } catch {}
  if (fsSync.existsSync(plistPath)) {
    fsSync.unlinkSync(plistPath);
    console.log(`Removed LaunchAgent: ${plistPath}`);
  }
}

// ─────────────────────── CLI flag dispatch ─────────────────────────
// One-shot self-registration. The compiled binary's own path
// (process.execPath) is what gets registered with the OS, so the
// install survives moving / renaming as long as the binary itself
// stays put. No root / admin / UAC needed on any platform — all
// install paths target the *user* (not system) scope.
//
// IMPORTANT: this block has to live BELOW the install functions and
// the constants they reference (SERVICE_NAME, WIN_REG_KEY, …). In
// regular Node, calling these functions before those `const`s are
// evaluated would throw a TDZ ReferenceError; in Bun's compiled
// standalone binary they silently evaluate to `undefined` and produce
// `reg add "undefined" /v undefined …` — which is exactly what
// bit me on the v1.0.0 binary.
const args = new Set(process.argv.slice(2));
if (args.has('--install')) {
  doInstall();
  process.exit(0);
}
if (args.has('--uninstall')) {
  doUninstall();
  process.exit(0);
}
if (args.has('--help') || args.has('-h')) {
  console.log(`MaxPOS print helper

Usage:
  maxpos-print-helper            Run the HTTP server (default).
  maxpos-print-helper --install  Register to auto-start on boot/login.
  maxpos-print-helper --uninstall  Remove the auto-start registration.
  maxpos-print-helper --help     Show this message.

Environment:
  PORT            HTTP port to bind. Default 9100.
  PRINTER_DEVICE  Device path / Windows queue. Default /dev/usb/lp0
                  on Linux/macOS, \\\\.\\XP58 on Windows.
  PAPER_WIDTH     Columns per line for thermal layout. Default 32 (58mm).`);
  process.exit(0);
}

// ───────────────────────────── ESC/POS ─────────────────────────────
const ESC = '\x1b';
const GS = '\x1d';

const INIT = ESC + '@';
const CODEPAGE_CP437 = ESC + 't\x00'; // select character table 0 = CP437
const ALIGN_LEFT = ESC + 'a\x00';
const ALIGN_CENTER = ESC + 'a\x01';
const BOLD_ON = ESC + 'E\x01';
const BOLD_OFF = ESC + 'E\x00';
const DOUBLE_ON = ESC + '!\x10'; // 2x height
const DOUBLE_OFF = ESC + '!\x00';
const CUT = GS + 'V\x00';
const LF = '\n';

// Cash drawer kick — ESC p m t1 t2.
//   m  = 0 (pin 2 / drawer 1, the common wiring; switch to 1 for pin 5
//          if your drawer is on the second pin)
//   t1 = 25 (on-time  in 2ms units = 50 ms pulse)
//   t2 = 250 (off-time in 2ms units = 500 ms gap)
// Standard Epson/Star/Xprinter command — works for the vast majority
// of cash drawers wired via the RJ-11 / RJ-12 DK port on the printer.
const DRAWER_KICK = ESC + 'p\x00\x19\xfa';

/**
 * Receipt content is UTF-8 but the printer renders bytes through its
 * loaded code page (CP437 by default on XP-58IIB / ZJ-58). Map the
 * few non-ASCII glyphs the receipt template can produce, fall back to
 * '?' for anything outside that set so the printer never tries to
 * render a multi-byte UTF-8 sequence and produce garbage.
 */
const CP437 = new Map([
  ['×', '\x9e'],
  ['·', '\xfa'],
  ['−', '-'], // U+2212 minus
  ['–', '-'], // en-dash
  ['—', '-'], // em-dash
  ['‘', "'"],
  ['’', "'"],
  ['“', '"'],
  ['”', '"'],
  ['€', 'EUR'],
  ['£', '\x9c'],
  ['¥', '\x9d'],
  ['°', '\xf8'],
  ['ñ', '\xa4'],
  ['Ñ', '\xa5'],
  ['á', '\xa0'],
  ['é', '\x82'],
  ['í', '\xa1'],
  ['ó', '\xa2'],
  ['ú', '\xa3'],
]);

function toCP437(text) {
  let out = '';
  for (const ch of text) {
    if (CP437.has(ch)) out += CP437.get(ch);
    else if (ch.charCodeAt(0) < 128) out += ch;
    else out += '?';
  }
  return out;
}

function pad(left, right, width = PAPER_WIDTH) {
  const space = Math.max(1, width - left.length - right.length);
  return left + ' '.repeat(space) + right;
}

function truncate(text, max) {
  return text.length > max ? text.slice(0, max - 1) + '.' : text;
}

function repeat(ch, n = PAPER_WIDTH) {
  return ch.repeat(n);
}

function money(symbol, value) {
  return `${symbol ?? ''}${Number(value ?? 0).toFixed(2)}`;
}

// ─────────────────────────── render ────────────────────────────────
function renderReceipt(d) {
  const out = [];
  out.push(INIT, CODEPAGE_CP437);

  // Pop the cash drawer first — printer fires the DK pin as soon as it
  // sees the kick command, well before the receipt actually feeds out.
  // Cashier reaches for change while the receipt is still printing.
  if (d.openDrawer) out.push(DRAWER_KICK);

  // Header
  out.push(ALIGN_CENTER, BOLD_ON, DOUBLE_ON);
  out.push(toCP437(d.storeName ?? 'Store') + LF);
  out.push(DOUBLE_OFF, BOLD_OFF);
  if (d.address) out.push(toCP437(d.address) + LF);
  if (d.phone) out.push(toCP437(d.phone) + LF);
  out.push(LF);

  // Sale meta
  out.push(ALIGN_LEFT);
  out.push(repeat('-') + LF);
  out.push(`Sale  : ${d.saleId ?? '—'}` + LF);
  const when = d.date ? new Date(d.date) : new Date();
  out.push(`Date  : ${when.toLocaleString()}` + LF);
  if (d.cashierName) out.push(`Cashier: ${toCP437(d.cashierName)}` + LF);
  out.push(`Pay   : ${d.paymentMethod ?? ''}` + LF);
  out.push(repeat('-') + LF);

  // Line items
  for (const line of d.lines ?? []) {
    const qty = `${line.quantity}x`;
    const name = truncate(toCP437(line.name ?? ''), PAPER_WIDTH - qty.length - 9);
    const amt = money(d.currencySymbol, line.lineTotal);
    out.push(pad(`${qty} ${name}`, amt) + LF);
  }
  out.push(repeat('-') + LF);

  // Totals
  out.push(pad('Subtotal', money(d.currencySymbol, d.subtotal)) + LF);
  if (Number(d.lineDiscountTotal ?? 0) > 0) {
    out.push(pad('Line disc', '-' + money(d.currencySymbol, d.lineDiscountTotal)) + LF);
  }
  if (Number(d.orderDiscountAmount ?? 0) > 0) {
    out.push(pad('Order disc', '-' + money(d.currencySymbol, d.orderDiscountAmount)) + LF);
  }
  out.push(pad('Tax', money(d.currencySymbol, d.tax)) + LF);
  out.push(BOLD_ON);
  out.push(pad('TOTAL', money(d.currencySymbol, d.total)) + LF);
  out.push(BOLD_OFF);

  if (d.paymentMethod === 'CASH') {
    out.push(pad('Cash', money(d.currencySymbol, d.cashReceived)) + LF);
    out.push(pad('Change', money(d.currencySymbol, d.change)) + LF);
  }
  out.push(LF);

  // Footer
  if (d.footer) {
    out.push(ALIGN_CENTER);
    for (const line of String(d.footer).split('\n')) {
      out.push(toCP437(line) + LF);
    }
    out.push(ALIGN_LEFT);
  }

  // Feed + cut
  out.push(LF.repeat(4));
  out.push(CUT);

  return Buffer.from(out.join(''), 'binary');
}

// ─────────────────────────── transport ─────────────────────────────
async function writeToPrinter(bytes) {
  await fs.writeFile(PRINTER_DEVICE, bytes);
}

// ──────────────────────────── HTTP ─────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      return res.end();
    }
    if (req.method === 'GET' && req.url === '/health') {
      return send(res, 200, {
        status: 'ready',
        device: PRINTER_DEVICE,
        paperWidth: PAPER_WIDTH,
      });
    }
    if (req.method === 'POST' && req.url === '/print') {
      const payload = await readJson(req);
      const bytes = renderReceipt(payload);
      await writeToPrinter(bytes);
      console.log(
        `[print] ${new Date().toISOString()} -> ${payload.saleId ?? '?'} ` +
          `(${bytes.length} bytes)`,
      );
      return send(res, 200, { ok: true, bytes: bytes.length });
    }
    if (req.method === 'POST' && req.url === '/kick') {
      // Standalone drawer-open. Sends only the kick command, no
      // receipt feed. Used for "no-sale" drawer access (making change,
      // etc.) and the Ctrl+D shortcut in the cashier shell.
      await writeToPrinter(Buffer.from(DRAWER_KICK, 'binary'));
      console.log(`[kick]  ${new Date().toISOString()}`);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && req.url === '/test') {
      // Minimal sample receipt — verifies wiring before going live.
      const bytes = renderReceipt({
        storeName: 'MaxPOS',
        address: 'Test print',
        saleId: 'TEST-1',
        date: new Date().toISOString(),
        paymentMethod: 'CASH',
        lines: [{ name: 'Sample item', quantity: 1, lineTotal: 1.0 }],
        subtotal: 1.0,
        tax: 0,
        total: 1.0,
        cashReceived: 1.0,
        change: 0,
        currencySymbol: '$',
        footer: 'Nothing was sold.\nHelper service OK.',
      });
      await writeToPrinter(bytes);
      return send(res, 200, { ok: true, bytes: bytes.length });
    }
    send(res, 404, { error: 'not found' });
  } catch (err) {
    console.error('[error]', err);
    send(res, 500, { error: err?.message ?? String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`MaxPOS print helper listening on http://localhost:${PORT}`);
  console.log(`Printer device: ${PRINTER_DEVICE}`);
  console.log(`Paper width:    ${PAPER_WIDTH} chars`);
  console.log(`Endpoints:      POST /print, POST /kick, POST /test, GET /health`);
});
