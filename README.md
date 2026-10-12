# ENZO Telegram bot — IELTS / CEFR, davomat va to'lov

O'quv markaz ilovasi (ENZO-APP backend, Node.js + MongoDB) uchun Telegram bot.
Bot ilova bilan **bitta MongoDB bazasidan** foydalanadi:

| Ilova kolleksiyasi | Bot nima qiladi |
|---|---|
| `users` | O'quvchilar ro'yxati, login (ism-familiya + parol, ilovadagi bilan bir xil), guruh, obuna/to'lov holati |
| `attendances` | Davomat belgilari — bot qo'ygan ✅/❌ ilovadagi davomat jadvalida ham ko'rinadi |

Botning o'z kolleksiyalari: `bot_tests`, `bot_attempts`, `bot_tg_links`, `bot_groups`, `bot_job_logs`.

## Imkoniyatlar

### 1. IELTS va CEFR bo'limlari
- Har birida 3 bo'lim: **Reading, Listening, Writing**.
- **Admin** testni bo'lib-bo'lib joylaydi: «➕ Test qo'shish» → imtihon → bo'lim → nom → materiallar (audio, PDF, rasm, matn, video — istalgancha, tartib bilan) → javob kaliti.
  Javob kaliti: `1-A 2-C 3-true 4-not given 5-colour/color` (muqobil variant `/` bilan) yoki har qatorda bittadan.
- **O'quvchi** testni ishlaydi → javoblarini bitta xabarda yuboradi → bot darhol tekshiradi (ball, foiz, IELTS band / CEFR darajasi — taxminiy).
- **Majburiy tahlil:** xato qilingan har bir savol uchun o'quvchi «nega xato qildim» tahlilini yozadi (kamida 15 belgi).
  **Tahlil tugamaguncha keyingi test ochilmaydi** (🔒). Writing'da: admin baho + izoh qo'yadi → o'quvchi izoh asosida tahlil yozadi → keyingisi ochiladi.
- Testlar bo'lim ichida ketma-ket ochiladi: ✅ ishlangan · 🔓 ochiq · 🧠 tahlil kerak · ⏳ tekshirilmoqda · 🔒 yopiq.

### 2. Natijalar, reyting va grafik
- «📊 Natijalarim» — bo'limlar bo'yicha o'rtacha natija, **o'syapti / pasayyapti** ko'rsatkichi va grafik rasmi.
- «🏆 Reyting» — butun o'quv markaz o'quvchilari reytingi.
- «📈 Grafik» — Telegram Mini App sahifasi (`public/index.html`): interaktiv grafik + reyting.
- **Ilovada ko'rsatish:** API (pastda) ilovaning o'z tokeni bilan ishlaydi. Tayyor React komponent: `integration/ExamResultsPanel.jsx`.
  Yoki ilovada WebView/havola orqali: `https://BOT_HOST/webapp/#token=<ilova JWT tokeni>`.

### 3. Guruhga ulanish va kunlik davomat
1. Botni Telegram guruhga qo'shing.
2. Guruhda admin yozadi: `/ulash 1-guruh` (ilovadagi `group_name`; nomsiz `/ulash` — barcha o'quvchilar).
3. Sozlamalar (guruhda): `/davomat_vaqti 14:00`, `/dars_kunlari 1,3,5` (1=Du … 7=Ya), `/sozlamalar`, `/uzish`.

Har dars kuni:
- **Davomat vaqtidan 30 daqiqa oldin** bot adminga (shaxsiy chatda) o'quvchilar ro'yxatini ochadi. Ismni bosish: ⬜ → ✅ keldi → ❌ kelmadi → ⬜. «✅ Qolganlar keldi» tugmasi ham bor.
- **Davomat vaqtida** bot guruhga yuboradi: ✅ kelganlar, ❌ kelmaganlar (belgilanmaganlar alohida).
- Qo'lda darhol yuborish: guruhda `/davomat` yoki ro'yxatdagi «📤 Guruhga yuborish».

### 4. Oylik to'lov
- Guruhda: `/tolov_sanasi 5 10:00` — har oyning 5-kuni soat 10:00 da (standart: 1-kuni 10:00). 31 qo'yilsa, qisqa oylarda oxirgi kun.
- O'sha kuni bot guruhga **kim to'lagan / kim to'lamagan** ro'yxatini yuboradi. Holat ilovadagi obuna qoidasi bo'yicha (`subscription_end_date` o'tmagan = to'lagan).
- Adminga to'lamaganlar ro'yxati tugmalar bilan keladi: «💵 Ism» → «✅ Ha, to'ladi» — ilovadagi «To'lov» tugmasi bilan bir xil ishlaydi (obuna shu oy oxirigacha, `payments` tarixiga yoziladi).
- Qo'lda: guruhda `/tolov`, botda «💰 To'lovlar».

Barcha vaqtlar — **Toshkent vaqti**. Rejalashtirilgan xabarlar bir marta yuboriladi; bot qisqa (20 daqiqagacha) o'chib qolsa ham, qayta yonganda yuboradi.

## Ishga tushirish

```bash
npm install
cp .env.example .env     # BOT_TOKEN, MONGO_URI (ilova bilan bir xil), JWT_SECRET (ilova bilan bir xil), ADMIN_IDS
npm start
npm test                 # bazasiz unit testlar
```

Node.js 18+. Bot long-polling bilan ishlaydi (webhook shart emas). Bitta nusxada ishga tushiring.
Mini App uchun `WEBAPP_URL` HTTPS bo'lishi kerak (masalan Render/Railway domeni + `/webapp/`).

**Kim admin:** `.env` dagi `ADMIN_IDS` (Telegram ID) yoki ilovada `role: admin` bo'lgan foydalanuvchi botga `/login` qilsa.

## Bot buyruqlari

| Qayerda | Buyruq | Tavsif |
|---|---|---|
| shaxsiy | `/start`, `/login`, `/menu`, `/cancel` | Kirish, menyu, bekor qilish |
| shaxsiy (admin) | `/statistika` | O'quvchilar, testlar, tekshirilmagan Writing soni |
| guruh (admin) | `/ulash [guruh]`, `/uzish`, `/sozlamalar` | Guruhni ulash/uzish |
| guruh (admin) | `/davomat_vaqti HH:MM`, `/dars_kunlari 1,3,5` | Davomat sozlamalari |
| guruh (admin) | `/tolov_sanasi KUN [HH:MM]` | To'lov hisoboti sanasi |
| guruh (admin) | `/davomat`, `/tolov` | Hisobotni hozir yuborish |

## API (ilova uchun)

Avtorizatsiya: `Authorization: Bearer <ilova tokeni>` (ilova JWT'i) yoki Mini App ichida `X-Telegram-Init-Data`.

| Metod | Yo'l | Tavsif |
|---|---|---|
| GET | `/api/exams/results?exam=ielts\|cefr[&user_id=]` | O'quvchi natijalari: `items[]` (sana, test, bo'lim, foiz, band/daraja), bo'limlar bo'yicha o'rtacha, `trend` (`up`/`down`/`flat`). `user_id` — faqat admin |
| GET | `/api/exams/leaderboard?exam=ielts\|cefr` | O'quv markaz reytingi (o'rtacha foiz, IELTS'da o'rtacha band, testlar soni) |
| GET | `/api/exams/summary` | Ilova bosh sahifasi uchun: ikkala imtihon bo'yicha o'rtacha va yo'nalish |
| GET | `/webapp/` | Grafik sahifasi (Mini App) |
| GET | `/health` | Holat |

O'sish/pasayish: oxirgi 3 natija o'rtachasi oldingi 3 tasi bilan solishtiriladi (±2% — barqaror).

## Eslatmalar
- IELTS band (Reading/Listening) xom balldan taxminiy hisoblanadi; 40 savollik bo'lmasa, mutanosib. CEFR darajasi foizdan taxminiy (B1 ≥ 51%, B2 ≥ 68%, C1 ≥ 87%).
- O'chirilgan test o'quvchilarga ko'rinmaydi, lekin uning natijalari grafik va reytingda saqlanadi.
- Davomat ro'yxati bitta xabarda 96 tagacha o'quvchi — katta markazda guruhlarni `group_name` bilan alohida ulang.
- Kiritish bosqichlari (login, javob yozish) xotirada; bot qayta ishga tushsa, boshlangan kiritishni qaytadan boshlash kerak. Tahlillar bazada saqlanadi — davom ettirsa bo'ladi.
