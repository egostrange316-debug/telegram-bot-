# ENZO Telegram bot — IELTS / CEFR, davomat va to'lov

O'quv markaz ilovasi (ENZO-APP backend, Node.js + MongoDB) uchun Telegram bot.
Bot ilova bilan **bitta MongoDB bazasidan** foydalanadi:

| Ilova kolleksiyasi | Bot nima qiladi |
|---|---|
| `users` | O'quvchilar ro'yxati, login (ism-familiya + parol, ilovadagi bilan bir xil), guruh, obuna/to'lov holati |
| `attendances` | Davomat belgilari — bot qo'ygan ✅/❌ ilovadagi davomat jadvalida ham ko'rinadi |

Botning o'z kolleksiyalari: `bot_tests`, `bot_attempts`, `bot_tg_links`, `bot_groups`, `bot_job_logs`, `bot_sessions`, `bot_link_codes`, `bot_screenshot_results`, `bot_attendance_reports`.

**Ishga tushirish va ilovaga ulash:** [bosqichma-bosqich yo‘riqnoma](docs/ILOVAGA_ULASH.md). `integration/ExamResultsPanel.jsx` mavjud ilovaning frontendiga qo‘shiladi; bu repoda frontendning o‘zi yo‘q.

1.1 versiyada: barcha bo‘limlar uchun majburiy tahlil, saqlanadigan suhbat bosqichlari, bir martalik akkaunt bog‘lash, katta guruhlar uchun sahifalash, qayta yuborish va MongoDB bilan jarayon testlari qo‘shilgan.

## Imkoniyatlar

### HTML test natijasi skrinshoti
- O‘quvchi shaxsiy chatda `/skrin` yoki «📷 Natija skrinshoti»ni bosadi, IELTS/CEFR va Reading/Listening/Writingni tanlaydi, rasm yuboradi. Bo‘sh suhbatga rasm yuborish ham tanlovni ochadi.
- Gemini rasmdagi **tayyor ballni o‘qiydi**. Bot javoblarni rasm asosida qayta baholamaydi va yo‘q ballni taxmin qilmaydi. JPG/PNG/WEBP, 6 MB gacha; 24 soatda 10 ta AI urinish.
- O‘quvchi o‘qilgan ballni 30 daqiqa ichida tasdiqlaydi. Natija botdagi bog‘langan akkauntga yoziladi; ism rasm ichidan olinmaydi.
- Tasdiqlangan natijalar shu o‘quvchining guruhiga navbatdagi **davomat hisoboti bilan birga** yuboriladi. Davomatdagi ✅/❌ faqat admin belgisidan olinadi. Kech yuborilgan natija keyingi hisobotga qoladi.
- Natijalar Mini App va React komponentida alohida tarix/foiz grafigida ko‘rinadi. Skrinshot haqiqiyligi tasdiqlanmagani sabab markaz reytingiga qo‘shilmaydi, bot testlarining tahlil qulfini ochmaydi.
- `GEMINI_API_KEY` va `GEMINI_SCREENSHOT_MODEL` serverda sozlanadi. Kalit yo‘q yoki xizmat ishlamasa, soxta natija yozilmaydi. Bu xizmat ENZO-APP’dagi Gemini tanloviga mos; OpenAI kaliti talab qilinmaydi.
- Shu rasmning Telegram IDsi va fayl xeshi takrorni ushlaydi; o‘zgartirilgan/qirqilgan skrinshot haqiqiyligini kafolatlamaydi. To‘liq HTML fayli va namunaviy skrinshot bilan jonli qabul sinovi hali kerak.

### 1. IELTS va CEFR bo'limlari
- Har birida 3 bo'lim: **Reading, Listening, Writing**.
- **Admin** testni bo'lib-bo'lib joylaydi: «➕ Test qo'shish» → imtihon → bo'lim → nom → materiallar (audio, PDF, rasm, matn, video — istalgancha, tartib bilan) → javob kaliti.
  Javob kaliti: `1-A 2-C 3-true 4-not given 5-colour/color` (muqobil variant `/` bilan) yoki har qatorda bittadan.
- **O'quvchi** testni ishlaydi → javoblarini bitta xabarda yuboradi → bot darhol tekshiradi (ball, foiz, IELTS band / CEFR darajasi — taxminiy).
- **Majburiy tahlil:** xato qilingan har bir savol uchun o'quvchi «nega xato qildim» tahlilini yozadi (kamida 15 belgi).
  **Tahlil tugamaguncha barcha bo‘limlarda yangi test va qayta ishlash ochilmaydi** (🔒). Xatosiz natijada ham umumiy tahlil yoziladi. Davom ettirish: `/tahlil`. Writing'da: admin baho + izoh qo'yadi → o'quvchi izoh asosida tahlil yozadi → keyingisi ochiladi.
- Testlar bo'lim ichida ketma-ket ochiladi: ✅ ishlangan · 🔓 ochiq · 🧠 tahlil kerak · ⏳ tekshirilmoqda · 🔒 yopiq.

### 2. Natijalar, reyting va grafik
- «📊 Natijalarim» — bo'limlar bo'yicha o'rtacha natija, **o'syapti / pasayyapti** ko'rsatkichi va grafik rasmi.
- «🏆 Reyting» — butun o‘quv markaz reytingi (API: dastlabki 100 o‘quvchi). Har bir testning birinchi baholangan natijasi hisoblanadi, qayta ishlashlar shaxsiy grafikda qoladi.
- «📈 Grafik» — Telegram Mini App sahifasi: SVG grafik, natijalar tarixi va reyting. 30 soniyada yangilanadi, tashqi grafik kutubxonasi talab qilinmaydi.
- **Ilovada ko'rsatish:** API (pastda) ilovaning o'z tokeni bilan ishlaydi. Tayyor React komponent: `integration/ExamResultsPanel.jsx`.
  Yoki ilovada WebView/havola orqali: `https://BOT_HOST/webapp/#token=<ilova JWT tokeni>`.

### 3. Guruhga ulanish va kunlik davomat
1. Botni Telegram guruhga qo'shing.
2. Guruhda admin yozadi: `/ulash 1-guruh` (ilovadagi `group_name`; nomsiz `/ulash` — barcha o'quvchilar).
3. Sozlamalar (guruhda): `/davomat_vaqti 14:00`, `/dars_kunlari 1,3,5` (1=Du … 7=Ya), `/sozlamalar`, `/uzish`.

Har dars kuni:
- **Davomat vaqtidan 30 daqiqa oldin** bot adminga (shaxsiy chatda) o'quvchilar ro'yxatini ochadi. Ismni bosish: ⬜ → ✅ keldi → ❌ kelmadi → ⬜. «✅ Qolganlar keldi» tugmasi ham bor.
- **Davomat vaqtida** bot guruhga yuboradi: ✅ kelganlar, ❌ kelmaganlar (belgilanmaganlar alohida).
- Qo‘lda darhol yuborish: guruhda `/davomat` yoki ro‘yxatdagi «📤 Guruhga yuborish». Bu avtomatik jadvaldagi hisobotni bekor qilmaydi.

### 4. Oylik to'lov
- Guruhda: `/tolov_sanasi 5 10:00` — har oyning 5-kuni soat 10:00 da (standart: 1-kuni 10:00). 31 qo'yilsa, qisqa oylarda oxirgi kun.
- O'sha kuni bot guruhga **kim to'lagan / kim to'lamagan** ro'yxatini yuboradi. Holat ilovadagi obuna qoidasi bo'yicha (`subscription_end_date` o'tmagan = to'lagan).
- Adminga to'lamaganlar ro'yxati tugmalar bilan keladi: «💵 Ism» → «✅ Ha, to'ladi» — ilovadagi «To'lov» tugmasi bilan bir xil ishlaydi (obuna shu oy oxirigacha, `payments` tarixiga yoziladi).
- Qo'lda: guruhda `/tolov`, botda «💰 To'lovlar».

Barcha vaqtlar — **Toshkent vaqti**. Muvaffaqiyatli yuborilgan xabarlar qayta yuborilmaydi; xatolar 20 daqiqalik oraliqda qayta uriniladi. Har bir admin va hisobot bo‘lagi alohida qayd etiladi. Telegram xabarni olgach, bazaga qayd yozilishidan oldin process to‘satdan o‘chsa takrorlanishi mumkin — Telegram aynan bir marta yuborish kafolatini bermaydi.

## Ishga tushirish

```bash
npm ci
cp .env.example .env     # BOT_TOKEN, MONGO_URI (ilova bilan bir xil), JWT_SECRET (ilova bilan bir xil), ADMIN_IDS
npm start
npm run test:unit        # bazasiz tekshiruvlar
npm test                 # MongoDB bilan to‘liq jarayon testlari
```

Node.js 22+. Bot long-polling bilan ishlaydi (webhook shart emas). Bitta nusxada ishga tushiring.
Mini App uchun `WEBAPP_URL` HTTPS bo'lishi kerak (masalan Render/Railway domeni + `/webapp/`).

**Kim admin:** `.env` dagi `ADMIN_IDS` (Telegram ID) yoki ilovada `role: admin` bo'lgan foydalanuvchi botga `/login` qilsa.

## Bot buyruqlari

| Qayerda | Buyruq | Tavsif |
|---|---|---|
| shaxsiy | `/start`, `/login`, `/menu`, `/cancel` | Kirish, menyu, bekor qilish |
| shaxsiy | `/skrin` | HTML test natijasi skrinshotini o‘qish va tasdiqlash |
| shaxsiy (admin) | `/statistika` | O'quvchilar, testlar, tekshirilmagan Writing soni |
| guruh (admin) | `/ulash [guruh]`, `/uzish`, `/sozlamalar` | Guruhni ulash/uzish |
| guruh (admin) | `/davomat_vaqti HH:MM`, `/dars_kunlari 1,3,5` | Davomat sozlamalari |
| guruh (admin) | `/tolov_sanasi KUN [HH:MM]` | To'lov hisoboti sanasi |
| guruh (admin) | `/davomat`, `/tolov` | Hisobotni hozir yuborish |

## API (ilova uchun)

Avtorizatsiya: `Authorization: Bearer <ilova tokeni>` (ilova JWT'i) yoki Mini App ichida `X-Telegram-Init-Data`.

| Metod | Yo'l | Tavsif |
|---|---|---|
| POST | `/api/telegram/link` | 5 daqiqalik bir martalik Telegramga ulash havolasi |
| GET | `/api/exams/results?exam=ielts\|cefr[&user_id=]` | O'quvchi natijalari: `items[]` (sana, test, bo'lim, foiz, band/daraja), bo'limlar bo'yicha o'rtacha, `trend` (`up`/`down`/`flat`). `user_id` — faqat admin |
| GET | `/api/exams/leaderboard?exam=ielts\|cefr` | O'quv markaz reytingi (o'rtacha foiz, IELTS'da o'rtacha band, testlar soni) |
| GET | `/api/exams/summary` | Ilova bosh sahifasi uchun: ikkala imtihon bo'yicha o'rtacha va yo'nalish |
| GET | `/webapp/` | Grafik sahifasi (Mini App) |
| GET | `/health` | Holat |

O'sish/pasayish: oxirgi 3 natija o'rtachasi oldingi 3 tasi bilan solishtiriladi (±2% — barqaror).

## Eslatmalar
- IELTS band (Reading/Listening) xom balldan taxminiy hisoblanadi; 40 savollik bo'lmasa, mutanosib. CEFR darajasi foizdan taxminiy (B1 ≥ 51%, B2 ≥ 68%, C1 ≥ 87%).
- O'chirilgan test o'quvchilarga ko'rinmaydi, lekin uning natijalari grafik va reytingda saqlanadi.
- Davomat/to‘lov ro‘yxati 40 tadan sahifalanadi; katta hisobotlar Telegram xabar chegarasiga mos bo‘linadi.
- Kiritish bosqichlari va admin materiallari 24 soat bazada saqlanadi; qayta ishga tushganda davom ettirish mumkin. Parol matni saqlanmaydi. Yakuniy tahlillar muddat cheklovisiz natijalar bilan saqlanadi.
- Tahlilning kiritilganligi va minimal uzunligi tekshiriladi; mazmunining to‘g‘riligini AI baholamaydi. Writingni o‘qituvchi tekshiradi.
- To‘lov hisoboti obuna muddatiga tayanadi; bankdan to‘lov qabul qilish/to‘lovni avtomatik tekshirish integratsiyasi yo‘q. Sanasiz hisob to‘lagan deb belgilanmaydi.
- Testni o‘quvchi ishlab bo‘lgach javob kalitini o‘zgartirish bloklanadi. Tuzatish uchun yangi test yarating.
