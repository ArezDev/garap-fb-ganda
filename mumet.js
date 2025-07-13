import puppeteer from 'puppeteer';
import readline from 'readline';
import fs from 'fs';
import axios from 'axios';

// Helper untuk delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function relogFB(cokis, index) {

    //Helper untuk waktu
    const waktu = () => {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        return `[ ${hh}:${mm} ]`;
    };
    // Atur posisi window ke kanan berdasarkan index
    const windowX = 320 * index;
    // Tambahkan delay berdasarkan index agar tidak membuka browser bersamaan
    await delay(index * 5_000); // Delay 5 detik per index
    const browser = await puppeteer.launch({
        executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
        ignoreDefaultArgs: ['--enable-automation'],
        headless: true,
        defaultViewport: null,
        args: [
            `--window-size=300,450`,
            `--window-position=${windowX},0`
        ]
    });
    const page = await browser.newPage();

    // Extract email and password from cokis string
    const [email, password] = cokis.split('|');
    const dismiss = fs.readFileSync(__dirname + '/tools/dismiss.js', 'utf-8');
    try {
        const domain = '.facebook.com';
        await page.goto('https://facebook.com/');
        const cookies = parseCookie(cokis, domain);
        if (cookies.length > 0) {
            await page.browserContext().setCookie(...cookies);
            await page.reload({ waitUntil: 'networkidle2' });
        }
        await page.waitForSelector('#email', { timeout: 10000 });
        await page.type('#email', email);
        await page.type('#pass', password);
        await page.click('[name="login"]');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
        await delay(5000); // Tunggu 5 detik untuk memastikan login selesai

        // Cek apakah login berhasil
        const loggedIn = await page.evaluate(() => {
            return document.querySelector('body') && !document.querySelector('input[name="email"]');
        });

        if (!loggedIn) {
            console.error(`[X] Login gagal: ${email}. Periksa kredensial atau cookie.`);
            fs.appendFile('gagal-login.txt', `${cokis}\n`);
            await browser.close();
            return; // Keluar dari fungsi jika login gagal
        }
       
        if (page.url().match(/601051028565049/)) {
             await page.evaluate(dismiss);
             await delay(15000); // Tunggu 15 detik untuk memastikan dismiss selesai
        }

        await delay(5000); // Tunggu 7 detik sebelum menjalankan script upload
        //Upload sampul dan profil
        //console.log(`${waktu()}[${email}] : Uploading profile and cover photos...`);
        var fotoProfil = await getImageBase64();
        var fotoSampul = await getCoverImageBase64();
        var js = fs.readFileSync('./tools/upload_foto_clone.js', 'utf-8');
        await page.evaluate(js + `
            startUploadProfiles('${fotoProfil}');
            setTimeout(() => {
                startUploadSampul('${fotoSampul}');
            }, 5000); // Tunggu 5 detik sebelum upload foto sampul
        `);
        await delay(5000); // Tunggu 5 detik untuk memastikan upload selesai
        //console.log(`${waktu()}[${email}] : Profile and cover photos uploaded successfully.`);
        await delay(7000); // Tunggu 7 detik sebelum menjalankan script lainnya

        // Jalankan script untuk memeriksa akun
        console.log(`${waktu()}[${email}] : Proses...`);
        await delay(5000); // Tunggu 5 detik sebelum menjalankan script Upload
        const result = await page.evaluate(async () => {
        /* ---------- helper di dalam browser ---------- */
        const delay = ms => new Promise(r => setTimeout(r, ms));

        // Library FB yang sudah ada di halaman
        const { USER_ID: uidku } = require("CurrentUserInitialData");
        const getAsyncParams      = require("getAsyncParams");

        // ---------- 1. cek daftar clone ----------
        let listResp;
        try {
            listResp = await fetch('/api/graphql/', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                fb_api_req_friendly_name: 'CometProfileSwitcherListQuery',
                variables               : '{"scale":2}',
                server_timestamps       : true,
                doc_id                  : '9039782136148253',
                ...getAsyncParams('POST')
            }),
            credentials: 'same-origin'
            }).then(r => r.json());
        } catch (e) {
            return { status: 'ERROR_FETCH', cloneId: null };
        }

        const nodes      = listResp?.data?.viewer?.actor?.profile_switcher_eligible_profiles?.nodes || [];
        const firstClone = nodes?.[0]?.profile.id ?? null;
        const isFanspage = nodes?.[0]?.profile.is_profile_plus ?? null;
        const canCreate  = listResp?.data?.viewer
                                ?.additional_profile_creation_eligibility?.single_owner?.can_create;
        if (nodes.length > 0 && firstClone && !isFanspage) {
            return { status: 'CLONE_SUDAH_ADA', cloneId: firstClone };
        }
        if (nodes.length > 0 && firstClone && isFanspage) {
            return { status: 'CLONE_FANSPAGE', cloneId: firstClone };
        }
        if (!canCreate) {
            return { status: 'TIDAK_BISA_CREATE', cloneId: null };
        }

        // ---------- 2. pastikan foto profil & sampul sudah di‑upload ----------
        await delay(5000);
        const fotoProfil = sessionStorage.foto_profil_gw;
        const fotoSampul = sessionStorage.foto_sampul_gw;
        if (!fotoProfil || !fotoSampul) {
            return { status: 'ERROR_UPLOAD_FOTO', cloneId: null };
        }

        // ---------- 3. coba create clone ----------
        const randDigit = n => [...Array(n)].map(() => Math.floor(Math.random() * 10)).join('');
        const names     = ["Emily","Madison","Emma","Olivia","Hannah","Abigail","Alexis",
                            "Isabella","Samantha","Ashley","Jessica","Sarah","Alyssa","Lauren",
                            "Taylor","Brianna","Kayla","Megan","Victoria","Natalie"];
        const nm        = names[Math.floor(Math.random() * names.length)];

        try {
            const createResp = await fetch('/api/graphql/', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                fb_api_req_friendly_name: 'AdditionalProfileCreateMutation',
                variables: JSON.stringify({
                input: {
                    name           : nm,
                    user_name      : `${nm}.${randDigit(6)}`,
                    source         : 'PROFILE_SWITCHER_UNIFIED_CREATION',
                    cover_photo    : { existing_cover_photo_id: fotoSampul,
                                    focus: { x: 0.5, y: 0.5 } },
                    profile_photo  : { existing_photo_id: fotoProfil },
                    actor_id       : uidku,
                    client_mutation_id: "2"
                }
                }),
                server_timestamps: true,
                doc_id           : '4699419010168408',
                ...getAsyncParams('POST')
            }),
            credentials: 'same-origin'
            }).then(r => r.json());

            const newId = createResp?.data?.additional_profile_create
                            ?.additional_profile?.id ?? null;

            if (newId) {
            return { status: 'CLONE_SUKSES', cloneId: newId };
            }
            return { status: 'GAGAL_CREATE', cloneId: null };

        } catch (e) {
            return { status: 'ERROR_FETCH', cloneId: null };
        }
        });

        /**
         *  Menyimpan cookie + (opsional) cloneId ke file.
         *  Format baris: email|pass|cloneId| ;c_user=...; xs=...; fr=...;
         */
        const saveCookies = async (page, filename, email, password, cloneId = '') => {
        const targetNames = ['c_user','xs','fr','datr','sb','wd','spin','presence','act','locale'];
        const cookies = await page.browserContext().cookies();
        const sessionCookies = cookies.filter(c => targetNames.includes(c.name));
        if (sessionCookies.length < 3) {
            console.warn(`[!] Cookie kurang lengkap utk ${email}`);
            return;
        }

        const cookieStr = sessionCookies.map(c => `${c.name}=${c.value}`).join('; ');
        // (opsional) deteksi checkpoint …
        try {
            const res  = await axios.get(`https://graph.facebook.com/${email}/picture?type=normal`,
                                        { maxRedirects: 0, validateStatus: null });
            const href = res.headers?.location || '';
            const isCheckpoint = href.includes('C5yt7Cqf3zU');
            console.log(isCheckpoint ? `${waktu()}[${email}] : Checkpoint!`
                                    : `${waktu()}[${email}] : LIVE!`);

            // ⬇️ tulis baris 
            fs.appendFileSync(filename,
            `${email}|${password}| ;${cookieStr}; |SUKSES_GANDA: ${cloneId || ''}\n`);
        } catch (e) {
            console.warn(`${waktu()}[!] Gagal cek akun ${email}:`, e.message);
        }
        };

        // Proses hasil dari script
        // -------------------------------------------------
        // result = { status: 'CLONE_SUKSES', cloneId: '12345678' } ‑‑ contoh
        // -------------------------------------------------
        const { status, cloneId } = result || {};

        // Nama file target per status
        const FILEMAP = {
        CLONE_SUKSES     : 'sukses-ganda.txt',   // clone berhasil dibuat
        CLONE_SUDAH_ADA  : 'wesono-ganda.txt',   // clone memang sudah ada
        CLONE_FANSPAGE   : 'fanspage-ganda.txt', // akun clone adalah fanspage
        TIDAK_BISA_CREATE: 'durong-ganda.txt',   // fitur belum tersedia
        GAGAL_CREATE     : 'gagal-ganda.txt',    // mutation gagal
        ERROR_UPLOAD_FOTO: 'error-foto-akun.txt',     // gagal upload profil/sampul
        ERROR_FETCH      : 'error-fetch-akun.txt',     // gagal fetch GraphQL
        UNKNOWN          : 'error-akun.txt'
        };

        switch (status) {
        case 'CLONE_SUKSES':
            console.log(`${waktu()}[${email}] ✅ Clone berhasil (ID: ${cloneId}).`);
            await saveCookies(page, FILEMAP[status], email, password, cloneId);
            await browser.close();
            break;

        case 'CLONE_SUDAH_ADA':
            console.log(`${waktu()}[${email}] ℹ️ Clone sudah ada (ID: ${cloneId}).`);
            await saveCookies(page, FILEMAP[status], email, password, cloneId);
            await browser.close();
            break;

        case 'CLONE_FANSPAGE':
            console.log(`${waktu()}[${email}] ℹ️ Clone adalah fanspage (ID: ${cloneId}).`);
            await saveCookies(page, FILEMAP[status], email, password, cloneId);
            await browser.close();
            break;

        case 'TIDAK_BISA_CREATE':
            console.log(`${waktu()}[${email}] ⚠️ Fitur akun ganda belum tersedia.`);
            await saveCookies(page, FILEMAP[status], email, password);
            await browser.close();
            break;

        case 'GAGAL_CREATE':
            console.log(`${waktu()}[${email}] ❌ Gagal membuat akun ganda.`);
            await saveCookies(page, FILEMAP[status], email, password);
            await browser.close();
            break;

        case 'ERROR_UPLOAD_FOTO':
            console.log(`${waktu()}[${email}] ❌ Gagal upload foto profil/sampul.`);
            await saveCookies(page, FILEMAP[status], email, password);
            await browser.close();
            break;

        case 'ERROR_FETCH':
            console.log(`${waktu()}[${email}] ❌ Error saat fetch GraphQL.`);
            await saveCookies(page, FILEMAP[status], email, password);
            await browser.close();
            break;

        default:
            console.error(`${waktu()}[${email}] ❓ Status tidak dikenal: ${status}`);
            await saveCookies(page, FILEMAP.UNKNOWN, email, password);
            await browser.close();
        }

    } catch (e) {
        //console.error('[×] Puppeteer Error:', e.message);
        console.error(`${waktu()} [LAUNCH‑ERROR] ${e.message}`);
        // tulis ke file agar tahu akun mana gagal
        fs.appendFileSync('launch-error.txt', `${cokis}\n`);
        return;      // lanjutkan loop, jangan hentikan program
    } finally {
      // tutup kalau masih terbuka
        if (browser) {
            try {
            await browser.close();        // kalau sudah tertutup akan melempar → ditangkap
            } catch (_) { /* abaikan */ }
        }
    }
    
};

const parseCookie = (cookieStr, domain) => {
    return cookieStr
        .split(';')
        .map(cookie => {
            const [name, ...rest] = cookie.trim().split('=');
            const value = rest.join('=');
            return {
                name,
                value,
                domain,
                path: '/',
            };
        })
        .filter(cookie => ['sb', 'datr'].includes(cookie.name));
};

(async () => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const MAX_BROWSER = await new Promise(resolve => {
        rl.question('Masukkan jumlah browser paralel (MAX_BROWSER): ', answer => {
            rl.close();
            resolve(Number(answer) || 1);
        });
    });

    //const lines = fs.readFileSync('akun.txt', 'utf-8').split('\n').filter(Boolean);
    const lines = fs.readFileSync('akun.txt', 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && line.includes('|'));

    let idx = 0;
    while (idx < lines.length) {
        // Ambil batch sebanyak MAX_BROWSER
        const batch = lines.slice(idx, idx + MAX_BROWSER);
        await Promise.all(
            batch.map((line, i) => relogFB(line.trim(), i))
        );
        idx += MAX_BROWSER;
        // Delay antar batch jika ingin (misal 2 detik)
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
})();