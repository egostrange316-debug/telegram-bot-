# Botni ilovaga ulash

Tekshirilgan backend: `egostrange316-debug/ENZO-APP` (`main`, 2026-10-21).
`models/User.js`, `models/Attendance.js`, `controllers/authController.js` bilan mos:
MongoDB `users` va `attendances`, `name_key/password_hash`, JWT `{id}` + HS256.
Botning test natijalari `bot_attempts` kolleksiyasiga yoziladi. Ilova ularni bot API orqali o‘qiydi.
HTML testlardan kelgan skrinshot natijalari alohida `bot_screenshot_results` kolleksiyasida.
Bu repo bot va tayyor frontend komponentini saqlaydi; mavjud ilovaning frontend kodi bu repoda yo‘q.

## Hozirgi frontend haqida

`Codify` reposining `main` va `egostrange316-debug-curly-spork` branchlari ham tekshirildi.
Ulardagi login Supabase `students` jadvali orqali ishlaydi va ENZO-APP JWT tokenini olmaydi.
Shu versiyaga komponentni qo‘shishning o‘zi hisoblarni avtomatik birlashtirmaydi.
Yuqoridagi komponent ENZO-APP `/api/auth/login` endpointidan olingan tokenni kutadi.
Hozir ishlatilayotgan frontend branchi aniqlanib, uning kirish tizimi ENZO-APP bilan
ulanishi yoki alohida tekshiriladigan akkaunt bog‘lash yo‘li qo‘shilishi kerak.
Frontend manba kodi bu bot reposiga nusxalanmadi va boshqa ilova repolari o‘zgartirilmadi.

## 1. Bot serveri

1. Node.js 22+ o‘rnating, `npm ci` bajaring.
2. `.env.example`ni `.env`ga ko‘chiring.
3. `BOT_TOKEN` — BotFather tokeni.
4. `MONGO_URI` — ENZO-APP bilan aynan bir xil **baza nomigacha** bo‘lgan manzil.
5. `JWT_SECRET` — ENZO-APP bilan aynan bir xil qiymat.
6. `ADMIN_IDS` — markaz administratorlarining Telegram IDlari.
7. `WEBAPP_URL=https://BOT_DOMEN/webapp/`, `CORS_ORIGINS=https://ILOVA_DOMEN`.
8. `npm start`. Bot bitta doimiy ishlaydigan process bo‘lishi kerak. Serverless yoki uxlab qoladigan hosting kunlik yuborishni kafolatlamaydi.

Docker bo‘lsa: `docker compose up -d --build`. Tashqi HTTPS reverse proxy
`127.0.0.1:8080`ga yo‘naltiriladi. MongoDB Atlas ishlatilsa, server IP manzili bazaning ruxsat ro‘yxatida bo‘lishi kerak.
Kalitlarni GitHubga commit qilmang. `.env` va Docker build konteksti ularni chiqarib tashlaydi.
`GET /health` baza ulanganida 200, uzilganida 503 qaytaradi.

## 2. Ilovadagi IELTS/CEFR sahifasi

`integration/ExamResultsPanel.jsx` faylini ilovaning `src/components` papkasiga ko‘chiring.
IELTS/CEFR natijalari sahifasida:

```jsx
import ExamResultsPanel from './components/ExamResultsPanel';

<ExamResultsPanel
  apiBase="https://BOT_DOMEN"
  token={localStorage.getItem('token')}
/>
```

`token` — ENZO-APP login endpointidan qaytgan haqiqiy JWT. Agar ilovangiz
tokenni boshqa joyda saqlasa, o‘sha qiymatni uzating. Bu yerga bot tokeni yoki JWT_SECRET yozilmaydi.
Komponent shaxsiy grafik, bo‘limlar natijalari, markaz reytingi va «Telegramga ulash» tugmasini ko‘rsatadi.
Natijalar 30 soniyada yoki «Yangilash» tugmasi orqali yangilanadi.

«Telegramga ulash» `POST /api/telegram/link`ni chaqiradi. Javobdagi `url` botni ochadi;
foydalanuvchi Start bosgach akkaunt ulanadi. Kod 5 daqiqalik va bir martalik,
bazada faqat SHA-256 xeshi saqlanadi. Bot ichida odatiy `/login` ham mavjud.

React bo‘lmasa, ilovadan Mini App sahifasini ochish mumkin:
`https://BOT_DOMEN/webapp/#token=ILOVANING_JWT_TOKENI`.
Token sahifa ochilgach URLdan olib tashlanadi, diskka saqlanmaydi.

## 3. Guruh va jadval

Admin avval botning shaxsiy chatida `/start` qiladi. Botni guruhga admin qilib qo‘shing.
Markaz admini Telegram guruhida ham admin bo‘lishi kerak.

```text
/ulash 1-guruh
/davomat_vaqti 14:00
/dars_kunlari 1,2,3,4,5,6,7
/tolov_sanasi 5 10:00
/sozlamalar
```

`1-guruh` ilovadagi `group_name` bilan bir xil. Nomsiz `/ulash` butun markazni ulaydi.
Har kuni yuborish uchun yuqoridagi 7 kunni bering. Yangi ulanadigan guruhda standart jadval har kuni.
Vaqt Toshkent bo‘yicha: 13:30 da admin ro‘yxatni oladi; 14:00 da guruh hisobotni oladi.
00:15 kabi jadvalda ro‘yxat oldingi kuni 23:45 da keladi.
Oylik hisobot obuna muddati va statusiga tayanadi; bu bank to‘lovini avtomatik tekshirish emas.
Admin «To‘ladi»ni tasdiqlaganda `payments` tarixiga yoziladi, obuna joriy oy oxirigacha uzayadi.
Avvaldan uzoqroq to‘langan muddat qisqartirilmaydi.

## 4. Qabul qilish tekshiruvi

### Skrinshot uchun qo‘shimcha sozlash

`ENZO-APP/services/geminiService.js` va kitob/audio xizmatlari Gemini ishlatadi.
Bot serveriga ham `GEMINI_API_KEY` qo‘ying; kalitni GitHubga yoki HTML fayliga yozmang.
Model `GEMINI_SCREENSHOT_MODEL` orqali tanlanadi (standart `gemini-3.1-flash-lite`).
Bu yangi OpenAI xizmatini yoki yangi AI akkauntini ochishni talab qilmaydi.

`/skrin` → imtihon/bo‘lim → rasm → «Natija to‘g‘ri». Har bir tasdiqlash 30 daqiqa amal qiladi.
Rasm Telegramdan server xotirasiga yuklanib, Gemini’ga inline yuboriladi; diskka yozilmaydi.
Bazada Telegram fayl IDsi, SHA-256 xeshi, o‘qilgan ball, akkaunt IDsi va holat saqlanadi.
Tasdiqlanmagan/failed yozuvlar 7 kundan so‘ng tozalanadi; tasdiqlangan natijalar tarixda qoladi.
AI faqat ko‘rinib turgan tayyor natijani o‘qiydi. O‘quvchi tasdig‘i testning haqiqiyligini
tasdiqlamaydi, shuning uchun bu natijalar alohida ko‘rsatiladi va markaz reytingiga kirmaydi.
Mavjud test tahlili bundan mustaqil qoladi.

`GET /api/exams/results` javobidagi `screenshots` maydoni oxirgi 200 tasdiqlangan natijani
qaytaradi (`score_label`, `score`, `maximum`, `percent`, `source: screenshot`, `verified: false`).
Telefon/Telegram ID yoki fayl ID API javobiga chiqmaydi. Eski `items` va reyting o‘zgarmaydi.

Guruh faqat o‘z ro‘yxatidagi o‘quvchilarning hali shu chatga yuborilmagan natijalarini oladi.
Muvaffaqiyatsiz yuborishda hisobotning tayyor matni saqlanadi va o‘sha matn qayta yuboriladi.
Keyin kelgan natijalar keyingi hisobotga tushadi. Qo‘lda yuborilgan natija navbatdan olinadi.
Bot hali guruhga ulanmagan bo‘lsa, natija bazada kutib turadi; `/ulash`dan keyin hisobotga qo‘shiladi.

### Sinovlar

- Admin IELTS va CEFRning Reading, Listening, Writing bo‘limlariga namunaviy material yuklaydi.
- O‘quvchi noto‘g‘ri javobli test topshiradi: boshqa bo‘lim ham tahlilgacha yopiq bo‘lishi kerak.
- Har xato tahlil qilinadi; xatosiz testda ham umumiy xulosa yoziladi. Writingni admin baholaydi.
- Ilovada shu o‘quvchining natijasi/grafigi va umumiy reyting yangilanadi.
- Davomat 30 daqiqa oldin adminga, jadval vaqti guruhga chiqadi. Barcha sahifalarni tekshiring.
- To‘lov muddati tugagan va sanasi yo‘q o‘quvchi qarzdorlar ro‘yxatida chiqadi.
- HTML faylingizdagi haqiqiy natija skrinshotini `/skrin` orqali yuboring, AI o‘qigan ballni solishtiring.
- Tasdiqlanmagan/xira rasm guruhga chiqmasin; tasdiqlangan natija davomatga qo‘shilsin.
- Hisobotdan keyin yuborilgan rasm keyingi hisobotga tushsin; boshqa guruh o‘quvchisining natijasi chiqmasin.
- Skrinshot natijasi majburiy tahlilni ochmasin; Mini App va ilova komponentidagi alohida grafikda ko‘rinsin.

Avtomatik testlar uchun `npm test`: alohida `enzo_bot_test` bazasi ishlatiladi.
`TEST_MONGO_URI` berilmasa, mongodb-memory-server test MongoDB binarini yuklaydi.
Ishchi bazangizning ulanishini `TEST_MONGO_URI`ga bermang.
Faqat bazasiz tekshiruv: `npm run test:unit`. GitHub Actions MongoDB 7 service bilan barcha testlarni bajaradi.
