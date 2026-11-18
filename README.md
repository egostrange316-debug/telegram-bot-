# Biologiya Mock Bot

Supabase’da ishlaydigan Telegram bot: biologiya mocklari, A/B/C/D javob kaliti,
rasm yoki matndan javob qabul qilish, vaqt chegarasi va guruh reytingi.
Eski IELTS/CEFR, davomat va to‘lov handlerlari jonli Edge botda ishlatilmaydi.

## Yangi: ZIP/JSON import va Telegram Mini App

**MOCK yuklash → qoralamani tekshirish → tasdiqlash → guruh → nom va mavzu.**
O‘quvchilar testni bot tugmalarida yoki xavfsiz Telegram HTML oynasida ishlaydi.
[Import formatlari, namunalar va qayta ishga tushirish](docs/MOCK_IMPORT.md).

## Boshlash

1. Bot egasi botga `/start` yuboradi. Faqat egada **Admin / O‘quvchi rejimi** tugmasi bor.
2. Botni biologiya Telegram guruhiga admin qilib qo‘shing; guruhda `/ulash` yozing.
3. Har bir a’zo guruhdagi **Qatnashaman** tugmasini bir marta bosadi yoki `/qatnashaman` yozadi.
4. **Admin rejimi → MOCK yuklash**: ZIP/JSON → qoralamani tekshirish → tasdiqlash → **Guruhga yuborish** → guruh → nom → mavzular → saqlash.
5. Faylli test uchun **Mock yaratish** yo‘li ham saqlangan. Nashr etishda sana o‘rniga nom va mavzu so‘raladi.
6. **🏷 Nom va mavzu** bilan mavjud test sarlavhasi/mavzularini o‘zgartiring. Savollar va kalit o‘zgarmaydi.

Barcha e’lon qilingan MOCKlar har kuni **07:00–22:00**, Toshkent vaqti bilan ochiq.
Topshirilgan test ishlanmaganlar ro‘yxatidan chiqadi; qayta topshirish admin ruxsatini talab qiladi.
Natija va tahlil topshirilgan kunning **22:10** vaqtida ochiladi. Telefon vaqti qarorga ta’sir qilmaydi.

## Javob topshirish

- Guruhdagi **🙋 Qatnashaman** a’zolikni tekshiradi, qatnashchini ro‘yxatga qo‘shadi va
  botning shaxsiy chatini aynan shu mock bilan ochadi. Telegram birinchi kirishda **Start**ni so‘rashi mumkin.
- ZIP/JSON testida **🧬 Testni boshlash** bosilsa, Mini App darhol shu test savollarini ochadi;
  mockni menyudan qayta tanlash shart emas. Mini App oynasini ochish uchun Telegram tugmasini bosish kerak.
- Eski guruh e’lonlaridagi **Qatnashaman** ham shu yo‘lga o‘tadi. 07:00 gacha yoki 22:00 dan keyin test ishlash yopiq.
- Botda mockni tanlab, `1A 2B 3C …` matni yoki javob varaqasining rasmini yuboring.
- Guruhda mock e’loniga **reply** qilib shu matn/rasmni yuborish mumkin.
- Guruhda `/javob MOCKKOD 1A 2B 3C …` ham ishlaydi; kod mock e’lonida yozilgan.
- Barcha savollarga A/B/C/D yoki bo‘sh qoldirilgan savol uchun `-` kiriting.
- Rasm/matndan olingan javoblar qayta ko‘rsatiladi. **Javoblarni tasdiqlash** muddatdan oldin bosilishi kerak.
- Qayta topshirish faqat adminning bir martalik ruxsati bilan mumkin. Reytingda bitta qatnashchi bitta natija oladi.
- AI faqat rasm belgilarini o‘qiydi. Bahoni serverdagi tasdiqlangan kalit hisoblaydi; bir to‘g‘ri javob — bir ball.
- Topshirgach faqat javoblar qabul qilingani ko‘rinadi. Baho va to‘g‘ri javoblar topshirilgan kunning 22:10 vaqtigacha yopiq. Muddatni server va baza tekshiradi.
- 22:10 dan keyin **Natijalarim → 🔍 Tahlil** orqali savollar, o‘z javobingiz va to‘g‘ri javoblarni ko‘rasiz. Xato/bo‘sh savollar filtri bor. Bu faqat ko‘rish: natija o‘zgarmaydi va yangi urinish ochilmaydi.

Bot egasi **O‘quvchi rejimi**da shu jarayon orqali topshiradi va reytingga kiradi.
Admin tahriri uchun yana **Admin rejimi**ga qaytadi. Egaga kalit oldindan ma’lum bo‘lishi tabiiy.

## Natijalar va musobaqa

Guruhga 22:10 dan keyin **Natijangizni ko‘rish** tugmasi yuboriladi, ballar yuborilmaydi.
Xabar faqat shu kuni topshirilgan natijalar bo‘lsa keladi; cron har daqiqada ishlagani
sababli bir daqiqagacha kechikishi mumkin. Ilovadagi ochilish cron xabariga bog‘liq emas.
**Natijalar** oynasida sana/guruh filtri va har bir topshirish uchun ism, MOCK nomi,
boshlash/topshirish vaqti, to‘g‘ri/umumiy va foiz bir qatorda turadi. **Haftalik yakun**
faqat oxirgi tugagan dushanba–yakshanbani jamlaydi. O‘chirilgan testlar hisoblanmaydi.

**Musobaqa → Xona yaratish → 2 yoki 3 kishi.** Do‘stlar 8 belgili kod bilan qo‘shiladi.
Hamma qo‘shilgach xona egasi hech bir qatnashchi ishlamagan testni tanlaydi va boshlaydi.
Hamma bir xil savollarni oladi. Eng ko‘p to‘g‘ri javob g‘olib; teng ball — durang.
Ballar va g‘olib faqat hamma topshirgach xona a’zolariga ko‘rinadi; kalit/tahlil 22:10 gacha yopiq.
Kutish xonasi 30 daqiqa, musobaqa ko‘pi bilan 60 daqiqa va har holda 22:00 gacha davom etadi.
Hamma topshirmay vaqt tugasa, g‘olib aniqlanmaydi. Boshlangan musobaqani qayta topshirish yo‘q.
Bir MOCKni bir paytda musobaqa va oddiy rejimda ishlash bloklanadi.

Telegram guruhining mavjud a’zolari ro‘yxatini bot avtomatik ola olmaydi. Har bir
qatnashchi bir marta **Qatnashaman** bosishi kerak. Xonaga kirish/ishlashda joriy a’zolik tekshiriladi.
`/uzish` guruh ulanishini va uning faol MOCKlarini to‘xtatadi.

## Xotira va ruxsatlar

- O‘quvchining javob rasmi RAM’da o‘qiladi; disk/Storage’ga va profilga rasm havolasi yozilmaydi.
- Javoblar, ball va xatolar tarixi MOCK o‘chirilguncha saqlanadi. Admin MOCKni o‘chirsa,
  uning barcha nusxalari, javoblari, urinishlari va natijalari ham o‘chadi; ilova ro‘yxati
  va tahlildan yo‘qoladi. Telegramga avval yuborilgan xabarlar avtomatik tahrirlanmaydi.
- Admin yuklagan savollar fayllari qayta yuborish uchun Telegram file_id ko‘rinishida saqlanadi.
- Rasm o‘qish: foydalanuvchiga kuniga 15 ta, 6 MB gacha. Matnli topshirish AI talab qilmaydi.
- Kalit rasm bilan kiritilsa admin tekshirib tasdiqlaydi. Guruhga yuboriladigan savollar fayliga kalitni qo‘shmang.
- Baza va RPC’lar faqat server roliga ochiq. Bot egasi Vault `enzo_ADMIN_IDS`ning birinchi IDsi;
  boshqa IDlar yoki eski ENZO admin rollari biologiya botiga admin huquqi bermaydi.
- Tokenlar repoga yozilmaydi. Vault sozlamalari 60 soniyagacha keshda turadi.

## Kod va tekshiruv

Jonli dastur: `src/edge/runtime.js` → `src/biology/`.
`src/storage/postgres.js` — saqlash adapteri; `bio_submit_v2` SQL funksiyasi — atomar qabul va baholash.
`supabase/functions/enzo-bot/` — maxfiy sarlavha bilan himoyalangan webhook va cron.

```bash
npm ci
npm run test:unit
npm run test:biology
npm run test:postgres
npm run check
npm run build:edge
```

Yangi loyiha: avval `supabase/sql/schema.sql`, keyin
`supabase/migrations/20261115072715_biology_mock.sql`,
`supabase/migrations/20261115085124_biology_import.sql`,
`supabase/migrations/20261116144055_biology_delete_results.sql`,
`supabase/migrations/20261118140357_biology_daily_rooms.sql`, Vault va cron sozlamalari.
Mavjud bazada faqat hali qo‘llanmagan migratsiyalarni bajaring.
Edge Function nomi va webhook URL o‘zgarmaydi: `enzo-bot`.
`npm start` eski MongoDB/ENZO serveri bo‘lib qolgan; biologiya botini u orqali ishga tushirmang.

[Supabase sozlash](docs/SUPABASE.md) · [Sinov holati](docs/TEST_STATUS.md) · [Eski ENZO qo‘llanmasi](docs/LEGACY_ENZO.md)
