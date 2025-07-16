import fs from 'fs';
import readline from 'readline';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { writeFileSync, appendFileSync } from 'fs';
puppeteer.use(StealthPlugin());

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BROWSER_LAUNCH_DELAY = (globalThis.AREZDEV_CONFIG?.browserLaunchDelaySec ?? 0) * 1000;
const configCode = fs.readFileSync('./config.js', 'utf8');
const arezCode = fs.readFileSync('./tools/inboxgrup.js', 'utf8');
const delay = (ms) => new Promise(res => setTimeout(res, ms));
const waktu = () => {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `[ ${hh}:${mm} ]`;
};

function parseAccountLine(line) {
  const first = line.indexOf('|');
  const second = line.indexOf('|', first + 1);
  if (first === -1 || second === -1) return null;
  const uid = line.slice(0, first).trim();
  const pass = line.slice(first + 1, second).trim();
  let cookieStr = line.slice(second + 1).trim();
  if (cookieStr.startsWith(';')) cookieStr = cookieStr.slice(1).trim();
  const cookies = {};
  cookieStr.split(';').map(s => s.trim()).filter(Boolean).forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    cookies[key] = val;
  });
  if (!cookies.sb || !cookies.datr) return null;
  return { uid, pass, cookies, raw: line };
}

function loadAccounts(parallel) {
  const lines = fs.readFileSync('akun.txt', 'utf8').split(/\r?\n/).filter(Boolean);
  const selected = [];
  const remaining = [];

  for (const line of lines) {
    const acc = parseAccountLine(line.trim());
    if (!acc || !acc.cookies.sb || !acc.cookies.datr) {
      console.warn('Cookie sb/datr hilang, skip:', acc?.uid || '-');
      continue;
    }
    if (selected.length < parallel) {
      selected.push(acc);
    } else {
      remaining.push(line);
    }
  }

  fs.writeFileSync('akun.txt', remaining.join('\n'));
  return selected;
}

function collectUIDsPerAccount(accCount) {
  const lines = fs.readFileSync('uid.txt', 'utf8').split(/\r?\n/).filter(Boolean);
  if (!lines.length) throw new Error('uid.txt kosong');

  const taken = lines.slice(0, accCount);
  const remain = lines.slice(accCount);
  writeFileSync('uid.txt', remain.join('\n'));
  appendFileSync('proses-uid.txt', taken.join('\n') + '\n');

  return Array.from({ length: accCount }, (_, i) =>
    taken[i] ? taken[i].split('|').map(s => s.trim()).filter(Boolean) : []
  );
}

function markProcessed(line) { appendFileSync('proses-akun.txt', line + '\n'); }
function markLoginFail(line) { appendFileSync('gagal-login.txt', line + '\n'); }

async function askNumber(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(res => rl.question(prompt, res));
  rl.close();
  const n = parseInt(answer.trim(), 10);
  if (isNaN(n) || n <= 0) throw new Error('Input harus angka positif');
  return n;
}
const askParallel = () => askNumber('Berapa instance browser paralel? ');

async function findLoginSelectors(page) {
  const EMAIL_SEL = ['#email', 'input[name="email"]', 'input[id="m_login_email"]'];
  const PASS_SEL = ['#pass', 'input[name="pass"]', 'input[id="m_login_password"]'];
  const emailSel = await page.evaluate(sels => sels.find(s => document.querySelector(s)), EMAIL_SEL);
  const passSel = await page.evaluate(sels => sels.find(s => document.querySelector(s)), PASS_SEL);
  if (!emailSel || !passSel) throw new Error('Selector email/pass tidak ditemukan');
  return { emailSel, passSel };
}

async function preparePage(browser, acc) {
  const { uid, pass, cookies: c } = acc;
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(configCode);
  await page.evaluateOnNewDocument(arezCode);
  await page.setCookie({ name: 'sb', value: c.sb, domain: '.facebook.com', path: '/' },
    { name: 'datr', value: c.datr, domain: '.facebook.com', path: '/' });
  if (c.c_user && c.xs) {
    await page.setCookie(
      { name: 'c_user', value: c.c_user, domain: '.facebook.com', path: '/' },
      { name: 'xs', value: c.xs, domain: '.facebook.com', path: '/' }
    );
  }
  await page.goto('https://facebook.com/login', { waitUntil: 'domcontentloaded' });
  if (page.url().includes("601051028565049")) {
    console.log(`${waktu()}[${uid}]`, 'Akun dismiss, wait...');
    await page.evaluate(() => {
      fetch("/api/graphql/", {
        "headers": {
            "content-type": "application/x-www-form-urlencoded"
        },
        "body": new URLSearchParams({
            "variables": JSON.stringify({}),
            "doc_id": "6339492849481770",
            ...require("getAsyncParams")("POST")
          }),
        "method": "POST",
        "mode": "cors",
        "credentials": "include",
        "redirect": "follow"
      });
    });
  } else if (/login(\.php)?/.test(page.url())) {
    console.log(`${waktu()}[${uid}] : Cookie kedaluwarsa, login ulang:`);
    if (!uid || !pass) throw Error('UID/PASS kosong');
    const { emailSel, passSel } = await findLoginSelectors(page);
    await page.type(emailSel, uid, { delay: 50 });
    await page.type(passSel, pass, { delay: 50 });
    await Promise.all([
      page.keyboard.press('Enter'),
      page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);
    if (/login(\.php)?/.test(page.url()))
      throw Error('Login gagal – cek password atau checkpoint');
  }
  
  await new Promise(res => setTimeout(res, 15000));
  return page;
}

async function runJob(page, uidList, uidTag) {
  await page.evaluate(async () => {
    const myHeaders = new Headers();
    myHeaders.append('content-type', 'application/x-www-form-urlencoded');
    const p1 = {
      fb_api_caller_class: 'RelayModern',
      fb_api_req_friendly_name: 'CometProfileSwitcherListQuery',
      variables: '{"scale":2}',
      server_timestamps: true,
      doc_id: '9039782136148253',
      ...require("getAsyncParams")("POST")
    };
    const res = await fetch('/api/graphql/', {
      method: 'POST',
      headers: myHeaders,
      body: new URLSearchParams(p1)
    }).then(r => r.json());
    const nodes = res?.data?.viewer?.actor?.profile_switcher_eligible_profiles?.nodes || [];
    const trg = nodes.length > 1 ? nodes[1] : nodes[0];
    if (trg?.profile?.id && !trg?.profile?.is_profile_plus) {
      const p2 = {
        fb_api_caller_class: 'RelayModern',
        fb_api_req_friendly_name: 'CometProfileSwitchMutation',
        variables: JSON.stringify({ profile_id: trg.profile.id }),
        server_timestamps: true,
        doc_id: '7240611932633722',
        ...require("getAsyncParams")("POST")
      };
      await fetch('/api/graphql/', {
        method: 'POST',
        headers: myHeaders,
        body: new URLSearchParams(p2)
      });
    }
  });

  try { await page.goto('https://facebook.com/?sk=welcome'); await page.waitForNavigation({ timeout: 15000 }); } catch (_) { }
  if (!/sk=welcome/.test(page.url())) throw new Error('Switch clone FB gagal');
  console.log(`${waktu()}[${uidTag}] : ✅ Clone Login berhasil!`);
  await page.waitForFunction(() => window.arezdev && window.arezdev.createGroups, { timeout: 10000 });
  console.log(`${waktu()}[${uidTag}] : Proses...`);

  return new Promise((resolve, reject) => {
    const tag = `[${uidTag}]`;
    const listener = msg => {
      const t = msg.text();
      if (!(t.startsWith(tag + ' done') || t.startsWith('[AREZ] done'))) return;
      page.off('console', listener);
      try {
        const data = JSON.parse(t.replace(/^\[[^\]]+\] done\s*/, ''));
        console.log(`${waktu()}${tag}`, data);
        resolve(data);
      } catch (e) { reject(new Error('Parse JSON done gagal')); }
    };
    page.on('console', listener);
    page.evaluate(async (list, uidTag) => {
      const waktu = () => {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        return `[ ${hh}:${mm} ]`;
      };
      const tag = `[${uidTag}]`;
      const cfg = window.AREZDEV_CONFIG || {};
      function isLoggedOut() {
        const EMAIL_SEL = ['#email', 'input[name="email"]', 'input[id="m_login_email"]'];
        const PASS_SEL = ['#pass', 'input[name="pass"]', 'input[id="m_login_password"]'];
        const emailFound = EMAIL_SEL.some(sel => document.querySelector(sel));
        const passFound = PASS_SEL.some(sel => document.querySelector(sel));
        return (emailFound && passFound);
      }
      try {
        if (!window.arezdev) return console.log(`${waktu()}[${tag}] : ${JSON.stringify({ error: "script tidak tersedia, kemungkinan belum login" })}`);
        if (isLoggedOut()) return console.log(`${waktu()}[${tag}] : ${JSON.stringify({ error: "Terlogout sebelum mulai workflow" })}`);
        if (cfg.enableCreateGroups !== false) {
          await window.arezdev.createGroups({ uidList: list, welcomeText: '' });
          if (isLoggedOut()) return console.log(`${waktu()}[${tag}] : ${JSON.stringify({ error: "Terlogout saat createGroups" })}`);
        }
        if (cfg.enableAddMembersToGroups) {
          await window.arezdev.addMembersToAllGroups({ uidList: list, delay: cfg.delaySec || 1 });
          if (cfg.addMemberWithText && Array.isArray(cfg.welcomeText) && cfg.welcomeText.length) {
            const txt = cfg.welcomeText[Math.floor(Math.random() * cfg.welcomeText.length)];
            if (txt) await window.arezdev.messageAllGroups({ text: txt });
          }
          if (isLoggedOut()) return console.log(`${waktu()}[${tag}] : ${JSON.stringify({ error: "Terlogout saat addMembers/message" })}`);
        }
        if (cfg.enableMessageAllGroups && !cfg.addMemberWithText) {
          if (Array.isArray(cfg.welcomeText) && cfg.welcomeText.length) {
            const txt = cfg.welcomeText[Math.floor(Math.random() * cfg.welcomeText.length)];
            await window.arezdev.messageAllGroups({ text: txt });
          }
          if (isLoggedOut()) return console.log(`${waktu()}[${tag}] : ${JSON.stringify({ error: "Terlogout saat messageAllGroups" })}`);
        }
        const ctx = window.__arezLast || {};
        console.log(`${waktu()}[${tag}] : ${JSON.stringify({ task: 'workflow', ...ctx })}`);
      } catch (e) {
        console.log(`${waktu()}[${tag}] : ${JSON.stringify({ error: e.message || 'error tidak diketahui' })}`);
      }
    }, uidList, uidTag).catch(reject);
  });
}

(async () => {
  const PARALLEL = await askParallel();

  while (true) {
    const accounts = loadAccounts(PARALLEL);
    if (!accounts.length) break;

    console.log(`\n${waktu()} Menjalankan batch ${accounts.length} akun`);

    const uidBatches = collectUIDsPerAccount(accounts.length);

    // Jalankan semua akun secara paralel
    await Promise.all(accounts.map((acc, i) => new Promise(async (resolve) => {
      const uidBatch = uidBatches[i];
      let browser; // <--- Definisikan di sini

      try {
        console.log(`${waktu()} Membuka browser untuk akun: ${acc.uid}`);

        await delay(i * BROWSER_LAUNCH_DELAY); // Delay antar akun

        browser = await puppeteer.launch({
          headless: false,
          executablePath: CHROME_PATH,
          protocolTimeout: 625000,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled'
          ],
          ignoreDefaultArgs: ['--enable-automation']
        });

        const page = await preparePage(browser, acc);
        await delay(BROWSER_LAUNCH_DELAY); // Delay sebelum runJob
        await runJob(page, uidBatch, acc.uid);
        markProcessed(acc.raw);

      } catch (e) {
        console.error(`[${acc.uid}] :`, e.message);
        if (uidBatch.length) {
          const remainingLines = fs.readFileSync('uid.txt', 'utf8');
          const line = uidBatch.join('|');
          fs.writeFileSync('uid.txt', line + '\n' + remainingLines);
        }
        appendFileSync('akun-gagal.txt', acc.raw + '\n');
        const akunLain = fs.readFileSync('akun.txt', 'utf8').trim();
        const akunBaru = acc.raw + '\n' + (akunLain ? akunLain + '\n' : '');
        fs.writeFileSync('akun.txt', akunBaru.trim() + '\n');
      } finally {
        try {
          if (typeof browser !== 'undefined' && browser?.close) {
            await browser.close();
          }
          console.log(`${waktu()} Browser untuk akun ${acc.uid} ditutup.`);
        } catch (err) {
          console.error(`Gagal menutup browser: ${err.message}`);
        }
        resolve();
      }
    })));

    // Optional delay antar batch
    if (BROWSER_LAUNCH_DELAY) await delay(BROWSER_LAUNCH_DELAY);
  }

  console.log('✅ SELURUH PROSES SELESAI');
})().catch(e => {
  console.error(e);
  process.exit(1);
});