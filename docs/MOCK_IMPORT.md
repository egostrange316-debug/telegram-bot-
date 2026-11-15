# Biologiya MOCK importi va Mini App

## Admin uchun

1. @Enzo_material_bot → `/menu` → **🛠 Admin rejimi**.
2. **📥 MOCK yuklash** → ZIP yoki yagona JSON yuboring (2 MB gacha). ZIPda bir nechta MOCK bo‘lsa, tugmalardan keraklisini tanlang. Saqlagach qolganlarini ham shu yuklashdan tanlash mumkin.
3. Bot har bir savolni va kalitni tekshiradi. Xato bo‘lsa savol IDsi bilan yozadi.
4. **📚 Barcha MOCKlar** → mock → **👁 Savollarni ko‘rish**, **🔑 Kalit**.
5. **✅ Qoralamani tasdiqlash**. Tasdiqlanmagan qoralama guruhga chiqmaydi.
6. **📤 Guruhga yuborish** → mock → guruh → hozir, sana yoki 50 talik haftalik navbat.
7. Sana uchun `2026-11-22 20:00 / 2026-11-22 21:30` formatida boshlanish va tugashni kiriting (Toshkent). Faqat boshlanish berilsa guruh davomiyligi ishlatiladi. Eng ko‘pi 4 soat.
8. **📊 Natijalar** / **🏆 Leaderboard** orqali natijalarni ko‘ring.

**Boshlanish eslatmasi:** bot boshlanishiga 10 minut qolganda tanlangan guruhga bir
marta xabar yuboradi. 10 minutdan kam vaqt qolgan bo‘lsa, qolgan minutni yozadi.
Bu oldindan rejalashtirilgan mocklar va haftalik navbat uchun avtomatik; alohida yoqish
shart emas. Savollar va javob topshirish faqat belgilangan boshlanish vaqtida ochiladi.

Bot guruhga hali ulanmagan bo‘lsa: botni guruh admini qiling, guruhda `/ulash` yuboring. Har bir qatnashchi **Qatnashaman** tugmasini bossin. Avvalgi ro‘yxatdan o‘tish va haftalik jadval ishlashda davom etadi.

**Tahrirlash:** faqat qoralama uchun shu `mock_id` va `version` bilan to‘liq tuzatilgan ZIP/JSON yuboring. Tasdiqlangan versiya o‘zgarmaydi; yangilash uchun `version`ni oshiring. Oldingi natijalar eski versiyaga bog‘langanicha qoladi.

**O‘chirish:** katalogdan yashiradi, o‘tkazilgan yoki allaqachon rejalashtirilgan testlar/natijalarni o‘chirmaydi. Boshlanmagan yuborishni bekor qilish: **Mocklar navbati**.

**Qayta topshirish:** **🔄 Qayta topshirishga ruxsat** → `MOCKKOD TELEGRAM_ID`; yoki Natijalar → mock → Ruxsat berish → ID. Faqat ochiq mockda, bir marta, jami 5 urinishgacha. O‘quvchi mockni qayta ochadi. Avvalgi urinish tarixi saqlanadi; reytingda oxirgi ruxsat etilgan natija turadi. Muddat tugagach ruxsat ham topshirishni ochmaydi.

## ZIP formati

Bitta MOCK uchun quyidagi fayllar bo‘lsin. Ular arxiv ildizida yoki oddiy papka ichida bo‘lishi mumkin:

- `mock.json` — majburiy: metadata va savollar.
- `answers.json` — majburiy: server uchun javoblar kaliti.
- `index.html` — ixtiyoriy: importda bajarilmaydi va o‘quvchiga tarqatilmaydi.

Bir ZIPda 10 tagacha MOCK mumkin. `NOM_mock.json` + `NOM_answers.json` nomlari ham taniladi; har bir testning HTML fayli ixtiyoriy. Savol va kalit fayllari nomiga emas, `mock_id` va `version`ga qarab bog‘lanadi. `README`, `README.txt` yoki `README.md` bo‘lsa e’tiborga olinmaydi. Ichki ZIP, bajariladigan kod fayllari, symlink va xavfli yo‘llar qabul qilinmaydi.

Masalan, oldingi ChatGPT arxivi shu holicha yuklanadi:

- `BIO7_MOCK_01_mock.json`, `BIO7_MOCK_01_answers.json`, `BIO7_MOCK_01.html`
- `BIO7_MOCK_02_mock.json`, `BIO7_MOCK_02_answers.json`, `BIO7_MOCK_02.html`

Bot avval barcha savol va kalitlarni tekshiradi, so‘ng **qaysi MOCKni saqlash** tugmalarini chiqaradi. Hech biri avtomatik tasdiqlanmaydi. Birinchi MOCK saqlangach ikkinchisini ham tanlang. Import tugmasini qayta bosish yoki `/cancel` qolgan tanlovni bekor qiladi; saqlangan qoralama o‘chmaydi.

Eski `BIO7-...` formatidagi `id/topic/question` maydonlari `question_id/source_topic/text`ga moslashtiriladi. Yetishmagan versiya 1, sinf `BIO7` kodidan 7, savollar soni ro‘yxatdan olinadi. Kitob savol raqami berilmagan bo‘lsa MOCK ichidagi tartib raqami qo‘yiladi; bu haqda qoralama kartasida yoziladi. Javoblar faqat mos JSON kalitidan olinadi; HTMLdan kalit chiqarilmaydi, yetishmagan javob taxmin qilinmaydi. Yangi standart format qat’iy tekshirilishda davom etadi.

ZIP 2 MB, 40 tagacha fayl/papka yozuvi; har bir ochilgan fayl 1 MB, jami ochilgan ma’lumot 2 MB gacha. Shifrlangan, ko‘p qismli, ZIP64, symlink va xavfli yo‘lli arxivlar rad etiladi. Saqlashdan oldin UTF-8, CRC, hajm va JSON tekshiriladi.

`examples/mock-30/mock-30.zip` — to‘liq ishlaydigan **format namunasi**, haqiqiy biologiya testi emas.

### mock.json

Quyidagi qisqa ko‘rsatma faqat maydonlarni tushuntiradi; to‘liq 30 savollik nusxa `examples/mock-30/mock.json`da.

```json
{
  "mock_id": "BIO7-05059-001",
  "title": "Biologiya MOCK 01",
  "grade": 7,
  "topics": ["50–51", "52", "55", "57", "59"],
  "question_count": 30,
  "version": 1,
  "questions": [
    {
      "question_id": "Q001",
      "source_topic": "50–51",
      "source_question_number": 5,
      "text": "Savol matni",
      "options": {"A": "Birinchi variant", "B": "Ikkinchi variant", "C": "Uchinchi variant", "D": "To‘rtinchi variant"}
    }
  ]
}
```

`question_count` 30 yoki 50; `questions` uzunligi aynan shu son. `grade` 1–12; `version` 1–9999. IDlar 1–64 ta ASCII harf/raqam/`-`/`_`, birinchi belgi harf yoki raqam. Savol matni 1500, variant 350, sarlavha 100 belgigacha. Har bir savolda A/B/C/D matnlari bo‘lishi shart. Kitobdagi savol raqami ma’lum bo‘lsa `source_question_number`ga aynan uni kiriting.

### answers.json

```json
{
  "mock_id": "BIO7-05059-001",
  "version": 1,
  "answers": {"Q001": "B", "Q002": "D", "Q003": "A"}
}
```

Bu qisqartirilgan misol. Amalda barcha 30/50 IDning kaliti kerak. Ortiqcha, yetishmagan yoki takrorlangan IDlar, mos kelmagan versiyalar va A/B/C/Ddan boshqa kalitlar rad etiladi. To‘liq namuna: `examples/mock-30/answers.json`.

## Bitta JSON bilan import

`mock` va `answer_key` obyektlarini bitta faylga birlashtiring:

```json
{"mock": {"...": "mock.json mazmuni"}, "answer_key": {"...": "answers.json mazmuni"}}
```

Bu sxema ko‘rsatmasi. Botga tayyor, to‘liq namuna: `examples/mock-30/import.json`. `mock.json` yoki `answers.json`ni yolg‘iz yuborish to‘liq import emas.

## O‘quvchi

Guruhdagi havola → bot → mock → **🧩 Botda ishlash** yoki **🌐 Test oynasini ochish**. Telegram ichida A/B/C/D tugmalari; Mini Appda savol raqamlari, taymer, javobni o‘zgartirish/tozalash va yakuniy tasdiq bor. Matn yoki javob varaqasi rasmi bilan topshirish ham saqlangan.

Natija: to‘g‘ri/umumiy, xato va foiz. Guruh leaderboardi va topshirmaganlar muddati tugagach chiqadi. Javob kaliti faqat admin panelida. Birinchi topshirishdan so‘ng o‘quvchi mustaqil ravishda natijani almashtira olmaydi.

Mini Appni oddiy brauzerda ochish foydalanuvchini tizimga kiritmaydi. Botdagi `web_app` tugmasidan ochish kerak. O‘quvchi IDsi va balli frontenddan qabul qilinmaydi: server Telegram HMAC imzosini tekshiradi, server sessiyasi beradi, guruh a’zoligini qayta tekshiradi va SQL ichida vaqt/urinishni tekshiradi.

`index.html` ichida kalit yoki begona JavaScript bo‘lishi mumkin. Shu sabab import savollar asosida umumiy ishonchli `miniapp/` oynasini tuzadi; original HTML dizayni yoki uning skriptlari bajarilmaydi. Savol matni HTML sifatida emas, oddiy matn sifatida chiqariladi. Import ZIP/JSON va kalit fayllarini o‘quvchi guruhiga yubormang.

## Texnik tuzilma

- `src/biology/importer.js`: ZIP, JSON va savol/kalit tekshiruvi.
- `import-ui.js`, `catalog.js`: admin katalogi va bot savollari.
- `auth.js`, `api.js`: Telegram Mini App autentifikatsiyasi va server API.
- `bio_packages`: qoralama/tasdiqlangan versiyalar; `bio_mocks`: guruhga o‘tkazishning o‘zgarmas nusxalari.
- `bio_attempts`: server boshlanish vaqti, urinish nonce, botda belgilangan javoblar, admin ruxsati.
- `bio_submissions`: Telegram ID, tashqi MOCK ID, versiya, savol IDlari, javoblar, vaqtlar, ball va avvalgi ruxsatli urinishlar.
- `bio_begin` va `bio_submit_v2`: PostgreSQL soati va advisory lock orqali atomar start/topshirish; takroriy bir xil request idempotent.
- Barcha jadvallar/RPC faqat `service_role` uchun. Brauzerga Supabase secret/service key yoki bot token yuborilmaydi.
- API: `POST /api/session`, `/api/list`, `/api/start`, `/api/submit`. JSON limit 16 KB; faqat belgilangan Mini App origin uchun CORS; `no-store` javoblar.
- Telegram initData 5 daqiqagacha qabul qilinadi; server sessiyasi 5 soat; test davomiyligi 4 soatgacha. Auth token xotirada, qoralama javoblar foydalanuvchi+urinishga bog‘langan sessionStorage’da saqlanadi.

## Yangilash va qayta ishga tushirish

Biologiya bot Supabase Edge Function sifatida ishlaydi. Alohida doimiy server/Python process ishga tushirish kerak emas.

```bash
npm ci
npm run check
npm run test:unit
npm run test:biology
npm run test:postgres
npm run build:edge
```

1. Mavjud bazada oldingi biologiya migratsiyasi ustidan **faqat** `supabase/migrations/20261115085124_biology_import.sql`ni qo‘llang. Mavjud bazada boshlang‘ich sxemani qayta yaratmang.
2. Vault’da `enzo_MINIAPP_URL`ga `https://biology-mock-enzo.egostrange316.chatgpt.site` yozing. `enzo_BOT_TOKEN`, `enzo_ADMIN_IDS`, Gemini va webhook/cron sirlarini saqlang. Tokenlar faqat server muhitida/Vault’da; `.env` Git’da yo‘q.
3. `miniapp/` fayllarini HTTPS static hostingga joylang. Boshqa hosting tanlansa `app.js`dagi API URL va `_headers`dagi origin ham moslansin. Supabase Edge Function HTML emas, API xizmatini beradi.
4. `enzo-bot` funksiyasini qayta deploy qiling: `index.ts`, `handler.mjs`, yangi `runtime.mjs`, `deno.json`. `verify_jwt=false` qoladi: webhook maxfiy sarlavhasi, cron siri va Mini App Telegram imzosi o‘z yo‘llarida tekshiriladi.
5. Mavjud `/webhook` manzili va `enzo-bot-every-minute` cron o‘zgarmaydi. Qayta deploy — Edge botning qayta ishga tushirilishi. Sozlamalar keshi 60 soniyagacha.
6. `/health` → 200; qalbaki `/webhook` va `/api/session` → 401. Botda `/menu` yuborib yangi tugmalarni oching.

Mavjud Supabase CLI loginidan so‘ng ushbu loyiha uchun qayta deploy buyrug‘i:

```bash
npm run build:edge
npx supabase functions deploy enzo-bot --project-ref sxcdniihidqfqivfijtn --no-verify-jwt --use-api
```

Bu buyruq faqat `enzo-bot`ni yangilaydi. `--prune` ishlatmang: loyihadagi boshqa funksiyalar kerak.

CLI orqali deploy ishlatilsa, loyihadagi pin qilingan Supabase CLI `--help` hujjatini tekshiring; platforma boshqaruv paneli yoki rasmiy MCP deploy ham mumkin. `npm start` eski MongoDB/ENZO dasturi: jonli biologiya bot uchun undan foydalanmang.

Yangi bazaga o‘rnatish tartibi: `supabase/sql/schema.sql`, `20261115072715_biology_mock.sql`, `20261115085124_biology_import.sql`, so‘ng Vault/webhook/cron — `SUPABASE.md`ga qarang.
