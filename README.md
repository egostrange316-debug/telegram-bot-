# ENZO Telegram bot — materiallar, natijalar va davomat

Bot **ilovasiz, mustaqil** ishlaydi. O‘quvchi Telegram guruhidagi havoladan ro‘yxatdan
o‘tadi; ilova akkaunti, parol yoki JWT kerak emas. Natijalar va davomat Telegram guruhiga chiqadi.

## O‘quvchining yo‘li

1. Guruhdagi **«Botga ro‘yxatdan o‘tish»** tugmasini bosib, ism-familiyasini yozadi.
   Bot uning shu Telegram guruhiga a’zoligini tekshiradi.
2. Pastki menyuda **📚 Materiallar → IELTS yoki CEFR → Reading, Listening yoki Writing**ni tanlaydi.
3. Material nomini bosganda, bot admin joylagan HTML/PDF/audio fayllarni tartib bilan yuboradi.
4. Fayllardan so‘ng: **«Testni ishlab bo‘lgach, natija skrinshotini shu chatga yuboring»** deb yozadi.
5. O‘quvchi testni ishlab, natija skrinshotini yuboradi. Qaytadan imtihon yoki bo‘lim tanlamaydi:
   rasm avval tanlangan materialga bog‘lanadi. Bot qayta yoqilganda ham tanlov 24 soat saqlanadi.
6. Gemini rasmdagi tayyor ballni o‘qiydi. O‘quvchi ball to‘g‘ri o‘qilganini tasdiqlaydi.
   Xato o‘qilgan bo‘lsa, aniqroq rasm yuboradi. Tasdiqlash muddati — 30 daqiqa.
7. Tasdiqlangan natija **davomat hisoboti bilan birga guruhga** yuboriladi. Hisobot vaqtidan
   keyin kelgan natija keyingi hisobotga qoladi. Davomatdagi ✅/❌ni admin belgilaydi.
8. O‘quvchi xatolarini tahlil qilib yozadi; tahlil tugamaguncha keyingi material ochilmaydi.
   `/cancel` bu talabni o‘chirmaydi. Davom ettirish: `/tahlil`.

## Admin material joylashi

**➕ Material qo‘shish → IELTS/CEFR → bo‘lim → nom → fayllar → ✅ Materiallar tayyor**.
HTML test, PDF, audio, rasm yoki matn yuborish mumkin; ko‘pi bilan 100 ta material.
Bu oqim javob kalitini so‘ramaydi: o‘quvchi fayldagi testni ishlab, uning natija rasmini yuboradi.
«📚 Testlar» orqali materiallarni ko‘rish yoki arxivlash mumkin. Oldingi natijalar saqlanadi.

AI skrinshotdagi **tayyor natijani o‘qiydi**; savollarni qayta baholamaydi va yo‘q ballni
hisoblab topmaydi. Rasmda test nomi va ball/maksimal ball ko‘rinib tursin.
Aniq boshqa test nomi ko‘rinsa rasm rad etiladi; nom ko‘rinmasa, bog‘lash o‘quvchi tanlagan
materialga tayanadi. Bu skrinshotning haqiqiyligini isbotlamaydi.

JPG/PNG/WEBP, 6 MB gacha. Bir o‘quvchiga 24 soatda 10 ta AI o‘qish urinishi.
Bir xil Telegram fayli va bir xil fayl xeshi takroriy natijani cheklaydi.
Skrinshot ballari shaxsiy tarix/grafikda alohida ko‘rinadi, markaz reytingiga qo‘shilmaydi.

## Supabase orqali bepul hosting

Supabase Edge Function botni Telegram webhook orqali ishlatadi. Ma’lumotlar Postgres’da,
kalitlar shifrlangan Vault’da saqlanadi. Supabase Cron har daqiqada davomat/to‘lov jadvalini
tekshiradi va tugallanmay qolgan Telegram yangilanishlarini tiklaydi. Alohida MongoDB serveri
bu variantda kerak emas. Bepul tarif limitlari va Gemini kvotalari amal qiladi.

[Supabase o‘rnatish va boshqarish yo‘riqnomasi](docs/SUPABASE.md).

## Node.js / Docker orqali ishga tushirish

Kerakli sozlamalar `.env.example`da:

| Sozlama | Nima uchun |
|---|---|
| `BOT_TOKEN` | BotFather bergan bot tokeni |
| `GEMINI_API_KEY` | Skrinshotni o‘qish xizmati |
| `ADMIN_IDS` | Markaz adminlarining Telegram IDlari, vergul bilan |
| `STANDALONE=true` | Ilovasiz rejim (standart) |
| `MONGO_URI` | Botning o‘z MongoDB bazasi |
| `GEMINI_SCREENSHOT_MODEL` | Rasm/JSON qo‘llaydigan Gemini modeli |

Kalitlar `.env` yoki hostingning maxfiy sozlamalarida saqlanadi, GitHubga yozilmaydi.
`JWT_SECRET` mustaqil bot uchun bo‘sh qoladi. `WEBAPP_URL` ham majburiy emas.

### Docker: bot va uning o‘z bazasi

`.env.example`dan `.env` yarating, bot tokeni, Gemini kaliti va admin IDlarini kiriting:

```bash
docker compose -f compose.yaml -f compose.standalone.yaml up -d --build
```

Bu variant MongoDB 7ni ichki tarmoqda ishga tushiradi. Ma’lumot `bot_mongo_data` nomli
Docker volume’da saqlanadi; MongoDB porti internetga ochilmaydi. Compose botning `MONGO_URI`
qiymatini ichki bazaga yo‘naltiradi. Bazani saqlash uchun `docker compose down -v` ishlatmang.

### Node.js: mavjud MongoDB bilan

Node.js 22+ va ishlaydigan MongoDB kerak. `.env`dagi `MONGO_URI`ni o‘zingizning bazangizga moslang:

```bash
npm ci
npm start
```

Node.js/MongoDB varianti bitta doimiy ishlaydigan process talab qiladi.
Supabase varianti yuqoridagi alohida webhook va Cron kirish nuqtalaridan foydalanadi. `GET /health` baza ulanganida 200 qaytaradi.

### Render

`render.yaml` doimiy bot workerini va ichki MongoDB xizmatini tayyorlaydi.
Ikkala xizmat pullik; Apply bosishdan oldin tariflarni tekshiring.
Kalitlar faylda yo'q, Render'ning maxfiy sozlamalarida beriladi.
[Render'da joylashtirish yo'riqnomasi](docs/RENDER.md).

### Keyin yana admin qo'shish

Supabase’da Vault ichidagi `enzo_ADMIN_IDS` qiymatiga (batafsil: [yo‘riqnoma](docs/SUPABASE.md)),
Node.js hostingida esa `ADMIN_IDS` qiymatiga barcha adminlarning raqamli Telegram IDlarini
vergul bilan kiriting, masalan `111111111,222222222`. Mavjud admin IDlarini ham qoldiring.
Supabase o‘zgarishni keyingi so‘rovlarda bir daqiqa ichida oladi. Node.js variantini yangi
sozlama bilan qayta ishga tushiring (Render’da redeploy).
Yangi admin botning shaxsiy chatida `/start` qiladi. Guruhni ulashi uchun Telegram
guruhida ham administrator bo'lishi kerak. Hozir bu ish hosting sozlamasi orqali
bajariladi; bot menyusida admin qo'shish tugmasi yo'q.

## Guruhni sozlash

1. Admin botning shaxsiy chatida `/start` qiladi. IDni bilish uchun `/id`.
2. Botni Telegram guruhga **administrator** qilib qo‘shadi.
3. Markaz admini guruhda ham administrator bo‘lishi kerak. Guruhda yozadi:

```text
/ulash 1-guruh
/davomat_vaqti 14:00
/dars_kunlari 1,2,3,4,5,6,7
/tolov_sanasi 5 10:00
```

`/ulash` javobida o‘quvchilar uchun ro‘yxatdan o‘tish tugmasi chiqadi.
Bir xil ismli Telegram guruhlarining ro‘yxatlari aralashmaydi. Bitta o‘quvchi bir nechta
ulangan guruhga a’zo bo‘lsa, har bir guruh havolasi orqali alohida qo‘shilishi mumkin.
Davomat ro‘yxatiga faqat botda ro‘yxatdan o‘tgan o‘quvchilar kiradi; Telegram butun guruh
ro‘yxatini botga avtomatik bermaydi. Guruhdan chiqish/kick yangilanishi kelganda o‘quvchi
shu guruh ro‘yxatidan olinadi; qayta kirsa ro‘yxatdan o‘tish tugmasini yana bosadi.

Soatlar **Toshkent vaqti** bilan. Misolda 13:30da admin davomat ro‘yxatini oladi, 14:00da
✅ kelganlar, ❌ kelmaganlar, belgilanmaganlar va navbatdagi skrinshot natijalari guruhga chiqadi.
Ro‘yxat sahifalanadi. Yangi guruh uchun standart jadval — har kuni.

Har oyning belgilangan kunida kim to‘lagani/to‘lamagani yuboriladi. Admin «💰 To‘lovlar»dan
«To‘ladi» deb qayd qiladi; bu bank tranzaksiyasini tekshirish emas. To‘langan muddat shu oy
oxirigacha uzaytiriladi; oldindan uzoqroq to‘langan muddat qisqartirilmaydi.

Qo‘lda hisobot: `/davomat`, `/tolov`. Sozlamalar: `/sozlamalar`. Uzish: `/uzish`.
Muvaffaqiyatsiz avtomatik yuborish 20 daqiqalik oraliqda qayta uriniladi. Hisobot matni
qayta urinishlar davomida o‘zgarmaydi; keyin kelgan natijalar keyingi hisobotga qoladi.
Telegram xabarni olgach, bazaga qayd yozilishidan oldin process uzilsa, takror yuborilishi mumkin.

## Ma’lumotlar va tekshiruv

Mustaqil rejim `bot_students` va `bot_attendances` kolleksiyalaridan foydalanadi.
Supabase variantida shu hujjatlar Postgres `enzo_documents_store` jadvalida,
Node.js variantida MongoDB kolleksiyalarida saqlanadi. Telegram yangilanishlari Supabase’da
alohida `enzo_updates` navbatiga yoziladi. Jadval va RPC funksiyalar faqat server kalitiga ochiq.
Rasm Telegramdan server xotirasiga olinib Gemini’ga yuboriladi; diskka yozilmaydi.
Tasdiqlanmagan skrinshot yozuvlari 7 kundan keyin o‘chadi, tasdiqlangan natijalar tarixda qoladi.

```bash
npm run check
npm run test:unit
npm run test:postgres
npm test
```

To‘liq testlar alohida `enzo_bot_test` bazasini ishlatadi; MongoDB bo‘lmasa test binarini
yuklashga urinadi. Joriy tekshiruv holati: [TEST_STATUS.md](docs/TEST_STATUS.md).
Jonli bot/Gemini va namunaviy HTML natija rasmi bilan qabul sinovi hali kerak.

Eski ilova integratsiyasi kodi moslik uchun saqlangan, faqat `STANDALONE=false` bilan
faollashadi. Hozirgi vazifa uchun kerak emas: [eski ulash yo‘riqnomasi](docs/ILOVAGA_ULASH.md).
