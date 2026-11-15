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
