# O‘chirish va kunlik/haftalik reyting — 2026-11-16

- `bio_delete_package` atomar migratsiyasi katalog MOCKini, barcha ishga tushirilgan/rejalashtirilgan nusxalarini o‘chiradi; savollar/kalitlar, topshirilgan javoblar, urinishlar va pending sessiyalar olib tashlanadi. Eski havola/worker testni qayta ocholmaydi. Faqat xizmat roliga ruxsat bor.
- Eski soft-delete ma’lumotlari migratsiya paytida tozalandi: 2 MOCKning 3 nusxasi yopildi, ularga tegishli saqlangan javob/urinish va kalitlar qoldig‘i 0. №3 ning `29/30` natijasi saqlandi. `29/60`ga sabab bo‘lgan o‘chirilgan №2 dagi `0/30` olib tashlandi.
- Mini App test/natija ro‘yxati va tahlil eski yozuvlarni ko‘rsatmaydi; o‘quvchi **Reyting** tugmasi kunlik hisobni ochadi. Guruhga test yakunida kunlik reyting, keyingi dushanba 00:00 Toshkentdan keyin oldingi to‘liq haftaning yakuni yuboriladi. Yetkazish xatosi qayta uriniladi, muvaffaqiyatli hisobot qayta yuborilmaydi.
- `npm run test:biology`: 135 tekshiruv PASS; `npm run test:postgres`: 17 PASS; `npm run test:unit`: 80 PASS. Qo‘shimcha migratsiya sinovi bir guruhdagi ikki eski o‘chirilgan MOCKni tozalash va boshqa natijani saqlashni tekshiradi. PGlite’da haqiqiy SQL, Telegram API soxta; yangi oqim xizmat roli bilan ham bajarildi.
- Tekshiruvlar: kun/hafta chegarasi, hafta tugamaguncha haftalik yakunni yubormaslik, qayta urinish, admin ruxsati, eski testni qayta yaratishni bloklash, ilova ro‘yxati/tahlili, qayta o‘chirish, boshqa MOCK natijasini saqlash.
- `npm run check`, `npm run build:edge`, `git diff --check`: PASS. Supabase `enzo-bot` v10 ACTIVE. `/health` 200, imzosiz `/api/list` 401. Cron muvaffaqiyatli, HTTP 202; oldingi hafta uchun haqiqiy yakun hisobotining `part:0` va `complete` yozuvlari `done`.
- Telegramga avval yuborilgan xabarlar avtomatik tahrirlanmaydi. Mini Appni qayta ochish yangi ro‘yxatni oladi. Frontend o‘zgarmadi, yangi soxta foydalanuvchi/guruh ma’lumoti jonli bazaga kiritilmadi.
- Yangi xavfsizlik advisor muammosi yo‘q. Oldingi [pg_net](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public) va alohida o‘yinning [RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) eslatmalari o‘zgartirilmadi.

---

# №3/№4 public/server-only ZIP integratsiyasi — 2026-11-15

- Asl `BIO_MOCK_3_4_QAYTA_YUKLASH.zip` (SHA-256 `d68f1cb4287b3c9f396c98f5da4ab518370dd576289ad444c3298250bfba4eaf`) tekshirildi: 7 fayl, 2 × 30 savol. Har ikkala HTML savollari tegishli public JSON bilan aynan bir xil. Kalitlar har bir savol IDsi uchun bor va A/B/C/Dga mos; biologik mazmun/kalitning ilmiy to‘g‘riligi ushbu dasturiy sinovning qismi emas.
- Importer `NOM_public.json`ni savollar fayli sifatida taniydi; `NOM_SERVER_ONLY_answers.json` avvalgi kalit matcheridan foydalanadi. `BOT_INTEGRATSIYA.txt` xavfsiz izoh sifatida e’tiborga olinmaydi. Yo‘l/hajm/CRC/ID/versiya/kalit tekshiruvlari saqlangan.
- Yuklangan HTML skriptlari yoki URLdagi sessiya namunasi bajarilmaydi. Testlar Telegram imzosi tekshiriladigan mavjud Mini App orqali ishlaydi; kalitlar public HTML yoki GitHubga kiritilmadi. Frontendni o‘zgartirish talab qilinmadi.
- Asl ZIP bilan PGlite va haqiqiy migratsiyalar asosida **119 oqim tekshiruvi PASS**: admin ZIP tanlovi → ikkita qoralama → tasdiqlash → HTML/API orqali topshirish → ballsiz kvitansiya → server muddatigacha yopiq natija → muddatdan keyin faqat ko‘rish. Har ikkala mockda soxta telefon vaqti, muddatni almashtirish, kechikkan javobni o‘zgartirish tekshirildi.
- Repo ichidagi sintetik ZIP bilan ham **119 PASS**; `npm run test:unit`: **80 PASS**. `npm run check`, `npm run build:edge`, `git diff --check`: PASS. Asl ZIPni qayta tekshirish: `BIO_IMPORT_ZIP=/absolute/path/to/private.zip npm run test:biology`. ZIP va haqiqiy kalitlar repo tashqarisida qoladi.
- Jonli katalogda №3 va №4 v1 allaqachon mavjud edi. Ularning savollari/kalitlari yuklangan fayllar bilan serverda solishtirildi va tengligi tasdiqlandi. №3 tasdiqlangan holicha qoldi. O‘chirilgan №4 faqat qoralamaga tiklandi; biriktirilgan oldingi testlar va natijalar o‘zgartirilmadi. Yangi guruh/vaqt rejalashtirilmadi.
- Supabase `enzo-bot` **v9 ACTIVE**. Health 200, ruxsatsiz review/webhook 401. Cron faol va muvaffaqiyatli. Bazada RLS saqlangan, `anon`/`authenticated` rollarida kalitlarni o‘qish huquqi yo‘q.
- Telegram/Gemini so‘rovlari sinovda soxta: guruhga sinov xabari yuborilmadi. Haqiqiy o‘quvchi akkaunti bilan mobil Mini App yakuniy sinovi bajarilmadi.

---

# Natijani muddatgacha yashirish va test tahlili — 2026-11-15

- Bot va Mini App topshirishni darhol tekshiradi/saqlaydi, lekin umumiy `ends_at`gacha faqat qabul kvitansiyasini beradi. Ball, foiz, xato savollar va to‘g‘ri javoblar berilmaydi; takroriy submit ham kalit/ballni oshkor qilmaydi.
- Muddatdan keyin **Natijalarim → Tahlil**: faqat o‘z topshirgan javoblari, to‘g‘ri variant, xato/bo‘sh savollar filtri. Eski test havolasi ham tahlilga yo‘naltiradi. Tahlil urinish, javob, natija yoki admin retake ruxsatini o‘zgartirmaydi.
- `POST /api/review` Telegram sessiyasi va umumiy tugash vaqtini serverda tekshiradi. Begona Telegram ID, topshirmagan akkaunt, vaqtgacha so‘rov va autentifikatsiyasiz kirish rad etiladi. Cron kechiksa ham tugash vaqti yetarli; kalit faol test javobiga kirmaydi.
- `npm run test:biology`: **104 PASS**; `npm run test:unit`: **78 PASS**; `npm run check`, `npm run build:edge`, `git diff --check`: PASS.
- `tests/miniapp-review.dom.cjs`: to‘rtta DOM sinov guruhi PASS (faqat ko‘rish, filtr/tarix, XSS matn, muddatgacha yopiq tahlil, ballsiz kvitansiya, Telegramdan tashqarida yopiq kirish). JSDOM mavjud bo‘lsa `node tests/miniapp-review.dom.cjs`; boshqa o‘rnatishdagi modul yo‘li `JSDOM_MODULE` bilan beriladi.
- Brauzerda alohida sintetik 3 savollik fixture bilan tahlil ranglari, matnlar va xato/bo‘sh filtri tekshirildi. Fixture jonli saytga kiritilmadi. Haqiqiy Telegram akkaunti bilan foydalanuvchi sinovi bajarilmadi, guruhga sun’iy test xabari yuborilmadi.
- Supabase `enzo-bot` **v8 ACTIVE**, Mini App **2-versiya** joylandi. Yangi baza migratsiyasi kerak emas. `/health` 200; autentifikatsiyasiz `/api/review` va qalbaki `/webhook` 401. Sites 2-versiyasi tekshirilgan manbadan yig‘ilib muvaffaqiyatli chop etildi. Terminaldan statik fayllarni qayta olish HTTP 403 bilan to‘xtadi; jonli fayllarning byte-taqqoslashi tasdiqlanmadi.
- O‘z HTMLini ulash uchun `/submit` kvitansiyasi, `/list` tarixi va `/review` formati `docs/MOCK_IMPORT.md`da yozildi. Statik HTMLda kalit bo‘lmasligi shart.

---

# Qatnashishdan testga o‘tish — 2026-11-15

- **Qatnashaman** guruh a’zoligini tekshirib, qatnashchini takrorlamasdan yozadi va `/start m_KOD` orqali botga yo‘naltiradi.
- Import qilingan mock shaxsiy chatda bitta karta va **Testni boshlash** Mini App tugmasini beradi. `run` aynan tanlangan testni ochadi; karta ochish urinish/retake sarflamaydi.
- Eski `bj:GURUH` tugmalari e’lon IDsi orqali mockni aniqlaydi. Umumiy guruh havolasi bitta ochiq testni ochadi; bir nechtasi bo‘lsa tanlash ro‘yxatini beradi.
- Boshlanish eslatmasidan oldindan yozilish, vaqtgacha testni yopiq saqlash, begona a’zo/boshqa guruh/bekor qilingan testni rad etish tekshirildi.
- `npm run test:biology`: 88 tekshiruv PASS (17 ta yangi qatnashish tekshiruvi), haqiqiy migratsiyalar bilan PGlite, Telegram API soxta.
- `npm run test:unit`: 77 PASS; `npm run check`, `npm run build:edge`: PASS.
- Telegram `getMe` bu botda `has_main_web_app: false` qaytardi. Joriy xavfsiz yo‘l: botga redirect → foydalanuvchi Mini App tugmasini bosadi. Ilova Telegram akkauntisiz avtomatik ochilgani da’vo qilinmaydi; haqiqiy Telegram mijozidagi yakuniy bosish sinovi foydalanuvchi tomonidan bajariladi.
- Baza migratsiyasi yoki Mini App frontendini o‘zgartirish talab qilinmadi. Haqiqiy guruhga sun’iy sinov xabari yuborilmadi.
- Supabase `enzo-bot` v7 ACTIVE holatiga joylandi. Deployda `import_map_path: deno.json` nisbiy yo‘li aniq beriladi; oldingi versiyaning vaqtinchalik absolyut yo‘li qayta ishlatilmaydi.

---

# MOCK boshlanish eslatmasi — 2026-11-15

- Boshlanishiga 10 minut qolganda tanlangan guruhga bir martalik eslatma qo‘shildi. Kechroq rejalashtirilsa yoki cron tiklansa, qolgan minutlar ko‘rsatiladi.
- Haftalik 50 talik navbat boshlanishdan 10 minut oldin tayyorlanadi; savollar va javob qabul qilish belgilangan vaqtgacha yopiq turadi.
- `npm run test:biology`: 71 tekshiruv PASS (14 ta yangi jadval tekshiruvi), PGlite va soxta Telegram API bilan.
- Sinovlar: vaqt chegarasi, Toshkent vaqti, takror yubormaslik, yuborish xatosidan qayta urinish, bekor qilingan/tugagan test, o‘chirilgan guruh va haftalik navbat tartibi.
- `npm run test:unit`: 77 PASS; `npm run check` va `npm run build:edge`: PASS.
- Jonli cron faol, har daqiqada ishlaydi; oxirgi bajarilishi muvaffaqiyatli. Baza migratsiyasi va yangi sozlama kerak emas.
- Supabase `enzo-bot` v6 ACTIVE holatiga joylandi.
- Telegram guruhiga sun’iy sinov xabari yuborilmadi.

---

# Umumiy ZIP importi tuzatildi — 2026-11-15

- Sabab: parser faqat 2–3 ta yozuvli ZIPni qabul qilgan; oldingi ChatGPT arxivida ikki MOCK uchun 6 ta fayl bor edi. Asl arxiv bilan aynan foydalanuvchi aytgan xato qayta hosil qilindi.
- Endi 10 tagacha MOCK / 40 ta fayl-papka yozuvi, xavfsiz papkalar va `NOM_mock.json`/`NOM_answers.json` formatlari taniladi. Kalitlar MOCK ID/versiya bo‘yicha bog‘lanadi.
- Eski BIO7 JSON sxemasi moslashtiriladi, javoblar o‘zgarmaydi, taxminiy metadata haqida adminga ko‘rsatiladi. HTML bajarilmaydi.
- `npm run test:unit`: 77 PASS; `npm run test:biology`: 57 PASS. Asl 6 faylli ZIP va ikkita avvalgi alohida import ZIP ham haqiqiy fayl baytlari bilan tekshirildi.
- Bir ZIPdan ikki MOCKni tanlab saqlash, admin ruxsati, eskirgan tugma, yetishmagan/takrorlangan kalit va xavfli yo‘llar tekshirildi.
- Bazaga o‘zgartirish kerak emas; `enzo-bot` Edge Function bundle yangilanadi.

---

# MOCK import va Mini App — 2026-11-15

- `npm run test:unit`: 71 test PASS.
- `npm run test:biology`: 52 ta oqim/xavfsizlik tekshiruvi PASS, haqiqiy migratsiyalar bilan PGlite.
- `npm run test:postgres`: eski ENZO oqimlari uchun 17 regressiya tekshiruvi PASS.
- `npm run check`, `npm run build:edge`: PASS.
- ZIP/JSON: hajm, yo‘l, CRC, symlink, buzilgan arxiv, takroriy JSON maydonlari/IDlar, kalit va versiya tekshirildi.
- Admin import → qoralama → tasdiq → jadval; bot tugmalarida ishlash; Mini App login/start/submit; noto‘g‘ri imzo/origin/versiya/vaqt; ruxsatli retake va eski oynaning nonce’sini rad etish tekshirildi.
- Import testlari Telegram/Gemini tarmog‘ini mock qiladi. Jonli guruhga sinov xabari yuborilmadi.
- Regressiya aniqlagan JSONB sort kalitlari tartibi xatosi tuzatildi: adapter ustuvorlik ro‘yxatini SQLga alohida uzatadi. Haftalik navbat va eski material tartibi saqlanadi.
- Supabase `enzo-bot` v4 ACTIVE. Jonli `/health` 200, ruxsatsiz webhook/session/list 401, CORS preflight 204, cron 202.
- Telegram webhook: pending 0, xato yo‘q. `setChatMenuButton` muvaffaqiyatli.
- Mini App HTTPS manzili: https://biology-mock-enzo.egostrange316.chatgpt.site
- Brauzerda Telegramdan tashqari kirish ekrani ko‘rildi. Haqiqiy Telegram akkauntining Mini App ichidagi yakuniy foydalanuvchi sinovi bajarilmagan; autentifikatsiya va topshirish oqimi avtomatlashtirilgan test bilan tekshirildi.
- `anon`/`authenticated` rollari yangi RPC va yopiq kalitlarga kira olmaydi; `service_role` kiradi. Yangi xavfsizlik advisor muammosi yo‘q. Oldingi pg_net va alohida o‘yin jadvali ogohlantirishlari o‘zgartirilmagan.
- Foydalanuvchining ikki yangi 30 savollik materiali ZIP/JSON formatiga moslashtirilib, import validatori bilan tekshirildi. Ularning kalitlari ochiq repoga yoki statik saytga qo‘yilmadi. Biologik mazmun va kalitning ilmiy to‘g‘riligi ushbu dasturiy tekshiruvning qismi emas.

---

# Biologiya botiga o‘tish — 2026-11-15

- `npm run test:unit`: 65 test PASS.
- `npm run test:biology`: PGlite’da production SQL bilan 27 biologiya tekshiruvi PASS;
  Telegram va Gemini javoblari testda soxta, jonli guruhga hech narsa yuborilmagan.
- Sinovlar: faqat ega adminligi; rejim almashtirish; guruh a’zoligi; fayl/kalit/haftalik navbat;
  yuborish xatosidan tiklanish; suratdan javoblarni tasdiqlash; guruhlarni ajratish;
  birovning tasdig‘ini rad etish; muddatgacha bahoni yashirish; qayta topshirishni bitta
  natijada saqlash; bir vaqtdagi topshirish; bazada kechikkan javobni rad etish;
  kalit/natija/topshirmaganlar/haftalik reyting; navbatda 50 talik yo‘q bo‘lsa ogohlantirish;
  `anon` rolining baholash RPC’siga kira olmasligi.
- `npm run test:postgres`: avvalgi 17 oqim yangi bazaviy migratsiya bilan regressiya tekshiruvi.
- `npm run check`: sintaksis tekshiruvi.
- Supabase `enzo-bot` v3 ACTIVE; `/health` 200 (`biology-mock-bot`), ruxsatsiz webhook 401,
  cron 202. Telegram webhook joyida, pending 0, oxirgi xato yo‘q.
- Telegram nomi `Biologiya Mock`, buyruqlar yangi menyuga moslashtirildi.
- Vault’da faqat ega IDsi qoldi. Eski botdan 5 o‘quvchi, 3 ulanish va ularning 9 davomat
  yozuvi olib tashlandi. Telegram guruhidan a’zolar chiqarilmadi. Biologiya guruhi hali ulanmagan.
- Yangi baholash RPC’si service_role uchun ochiq, anon/authenticated uchun yopiq; RLS saqlangan.
  Oldingi [pg_net ogohlantirishi](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public)
  saqlanmoqda. Shu loyihadagi alohida o‘yin funksiyasi/jadvallari o‘zgartirilmadi.
- Haqiqiy biologiya guruhi, foydalanuvchi yuklagan 50 savollik mock va haqiqiy javob varaqasi
  bilan qabul sinovi hali kerak. Ular suhbatda berilmagan; guruh `/ulash` bilan ulanadi.

---

# Tekshiruv holati — 2026-10-23

- ZIPdagi dastlabki fayllar repo bilan to‘liq solishtirildi: farq yo‘q edi.
- `npm run check`: JavaScript sintaksis tekshiruvi o‘tdi.
- `npm run test:unit`: 59/59 tekshiruv o‘tdi (45 ta bot, 10 ta Supabase webhook/adapter, 4 ta hisobot yuborish testi).
- React komponenti JSX parserdan o‘tdi; Mini App DOM sinovida SVG chizish, IELTS/CEFR almashtirish, HTML escaping, URLdan tokenni olish va 401 xabari tekshirildi. Skrinshotning alohida grafigi/tarixi, nol ball va rasm nomidagi HTML escaping ham tekshirildi. Bu piksel/render skrinshot tekshiruvi emas.
- `tests/workflows.test.js`: haqiqiy MongoDB bilan ishlaydigan 22 jarayon testi bor (16 asosiy, 3 skrinshot, 3 mustaqil bot/material jarayoni).
- Ushbu ish muhitida MongoDB binari `open: Operation not permitted` sabab ishga tushmadi;
  shu sabab MongoDB jarayon testlari mahalliy muhitda tasdiqlanmagan.
- 2026-10-22 dagi to‘liq `npm test` urinishida ham MongoDB `exit code 100` bilan ishga tushmadi:
  41 bazasiz test o‘tdi, 22 MongoDB testi umumiy tayyorlash bosqichida to‘xtadi.
- [GitHub Actions urinishida](https://github.com/egostrange316-debug/telegram-bot-/actions/runs/39532863675)
  GitHub akkaunt billing muammosi tufayli jobni boshlamadi. Bu test assertion xatosi emas.

Billing cheklovi bartaraf etilgach Actions orqali qayta ishga tushiring yoki kompyuteringizda
`npm ci && npm test` bajaring. Testlar alohida `enzo_bot_test` bazasini ishlatadi.
Haqiqiy o‘quvchi va Telegram guruhida yakuniy qabul sinovi hali bajarilmagan.
Bot/Gemini kalitlari hamda admin ID maxfiy mahalliy sozlamaga kiritildi; repoga kiritilmadi.
Railway va Render variantlari ishlatilmadi. Supabase Free loyihasi yaratildi va
`enzo-bot` Edge Function ACTIVE holatiga joylashtirildi.

Avtomatik skrinshot unit testlarida Gemini va Telegram javoblari soxta sinov javoblari bilan berildi.
Alohida jonli sinovda Telegram `getMe` va Gemini model so‘rovi o‘tdi. Gemini sun’iy IELTS
Reading natija rasmidagi 27/40 ballni to‘g‘ri o‘qidi. Dastlabki Node fetch urinishida xizmat
xatosi kuzatildi; muvaffaqiyatli so‘rov Python HTTP transporti orqali, botning o‘z prompti,
JSON sxemasi va tekshiruv funksiyasi bilan bajarildi. Bu to‘liq Telegram → bot → Gemini
qabul sinovi emas. Foydalanuvchining haqiqiy HTML natija skrinshoti bilan sinov hali kerak.
Yangi MongoDB jarayonlari akkauntga tegishlilik, takroriy tasdiq, tahlil qulfini saqlash,
API orqali shaxsiy natija, AI xatosi, guruh chegarasi, qayta yuborish va kech kelgan natijani qamraydi.

Mustaqil bot testlari guruhga a’zolik, parolsiz ro‘yxatdan o‘tish, bir xil nomli guruhlarni
ajratish, HTML/audio materialini javob kalitisiz joylash, fayl → esda qolgan material →
skrinshot → tasdiq → tahlil → keyingi fayl ketma-ketligini tekshiradi. Bazasiz sinovlarda
MongoDB chaqiruvlari soxta javoblar bilan berilgan; ular haqiqiy indeks/saqlash sinovini almashtirmaydi.


## Supabase tekshiruvi

- ENZO uchun alohida loyiha yaratish narxi connector orqali `$0/oy` deb qaytdi.
- Tokenlar va admin IDlari Supabase Vault’da shifrlangan holatda saqlandi.
- Jonli Postgres’da `tests/postgres.integration.sql` PASS: array/NULL/range filtrlari,
  membership, to‘lov takrorlanmasligi, unique Telegram ID, bir vaqtning o‘zida bitta tahlil,
  lease, Telegram update deduplikatsiyasi, service_role Vault kirishi. Fixturelar rollback qilindi.
- `npm run test:postgres`: alohida PGlite bazasida 17 oqim tekshiruvi PASS: guruh ochish,
  ro‘yxatdan o‘tish va session saqlanishi, admin HTML/audio yuklashi, material konteksti,
  skrinshot tasdig‘i va majburiy tahlil, hisobotga natija qo‘shish va takror yubormaslik,
  to‘lov, shaxsiy tarix. Bunda Telegram va Gemini chaqiruvlari mock, Postgres haqiqiy SQL.
- Skrinshot havolasi hisobot muvaffaqiyatli yuborilgach o‘chadi; xato yoki faol yuborish
  paytida saqlanadi. Natijalar tarixi, takror skrinshotni aniqlash va majburiy tahlil
  saqlanishi SQL oqimida tekshirildi. Ko‘p qismli hisobot xatosidan keyingi qayta urinish
  hamda eski/yakunlangan yuborishlar unit testlarda tekshirildi.
- Jonli funksiya: `/health` 200; ruxsatsiz `/webhook` 401; maxfiy sarlavhali sinov update 200;
  navbat yozuvi `done`, urinishlar 1. Sinov update xabarsiz edi va hech kimga xabar yubormadi.
- Telegram `setWebhook` ulandi: Supabase webhook URL, `max_connections=1`, pending updates 0, oxirgi xato yo‘q.
- `/cron` 202; `cron.job_run_details` `succeeded`; `net._http_response` 202, timeout/xato yo‘q.
- RLS va service-only RPC ruxsatlari qo‘yildi. Advisor’da `pg_net` public sxemada ekanligi
  haqida bitta WARN qoldi. [Holat va rad etilgan o‘zgartirishlar](SUPABASE.md#joriy-loyiha-uchun-eslatma).
- Jonli funksiyani fixture test bilan almashtirish rad etildi; u production funksiyani o‘zgartirmadi.
  Buning o‘rniga mahalliy PGlite oqim testi bajarildi.

Haqiqiy HTML fayl va skrinshot bilan Telegram → Gemini → guruh natijasi sinovini o‘quv
markaz admini guruhni ulab, material joylaganidan keyin bajarish mumkin. Hozir guruhlar
va o‘quvchilar bazasi bo‘sh; bot guruhdagi to‘liq a’zolar ro‘yxatini Telegramdan o‘zi ololmaydi.
