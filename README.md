# Biologiya Mock Bot

Supabase’da ishlaydigan Telegram bot: biologiya mocklari, A/B/C/D javob kaliti,
rasm yoki matndan javob qabul qilish, vaqt chegarasi va guruh reytingi.
Eski IELTS/CEFR, davomat va to‘lov handlerlari jonli Edge botda ishlatilmaydi.

## Boshlash

1. Bot egasi botga `/start` yuboradi. Faqat egada **Admin / O‘quvchi rejimi** tugmasi bor.
2. Botni biologiya Telegram guruhiga admin qilib qo‘shing; guruhda `/ulash` yozing.
3. Har bir a’zo guruhdagi **Qatnashaman** tugmasini bir marta bosadi yoki `/qatnashaman` yozadi.
4. Botning shaxsiy chatida **Admin rejimi → Mock yaratish**:
   nom → 30 yoki 50 savol → savollar fayllari → **Fayllar tayyor** → kalit → kalit tasdig‘i → guruh → vaqt.
5. Haftalik 50 talik mock uchun **Haftalik navbatga** tanlang. Keyin **Guruh sozlamalari**dan
   kun, vaqt, davomiylikni belgilang va **Jadvalni yoqish**ni bosing.

Standart jadval qiymati: yakshanba 20:00, 90 daqiqa, Toshkent vaqti. Dastlab o‘chiq.
Kunlar: 0=yakshanba, 1=dushanba, …, 6=shanba. Masalan `0 20:00 90`.
Bir martalik 30/50 talik mockni yaqin daqiqaga yoki aniq kelajak sanasiga rejalashtirish mumkin.

## Javob topshirish

- Botda mockni tanlab, `1A 2B 3C …` matni yoki javob varaqasining rasmini yuboring.
- Guruhda mock e’loniga **reply** qilib shu matn/rasmni yuborish mumkin.
- Guruhda `/javob MOCKKOD 1A 2B 3C …` ham ishlaydi; kod mock e’lonida yozilgan.
- Barcha savollarga A/B/C/D yoki bo‘sh qoldirilgan savol uchun `-` kiriting.
- Rasm/matndan olingan javoblar qayta ko‘rsatiladi. **Javoblarni tasdiqlash** muddatdan oldin bosilishi kerak.
- Muddatgacha qayta topshirish mumkin: oxirgi tasdiqlangan javob saqlanadi. Reytingda bitta qatnashchi bitta natija oladi.
- AI faqat rasm belgilarini o‘qiydi. Bahoni serverdagi tasdiqlangan kalit hisoblaydi; bir to‘g‘ri javob — bir ball.
- Kalit va baholar mock tugaguncha berilmaydi. Muddatni bazaning soati ham tekshiradi.

Bot egasi **O‘quvchi rejimi**da shu jarayon orqali topshiradi va reytingga kiradi.
Admin tahriri uchun yana **Admin rejimi**ga qaytadi. Egaga kalit oldindan ma’lum bo‘lishi tabiiy.

## Guruh hisobotlari

Muddat tugagach bot javob kaliti, har bir topshirgan qatnashchining bali,
mock reytingi, topshirmaganlar va haftalik reytingni guruhga chiqaradi.
Teng ball — teng o‘rin; haftalik reyting shu haftadagi to‘g‘ri javoblar yig‘indisi bo‘yicha.
So‘nggi 10 daqiqada eslatma chiqadi. Xatolar tafsiloti shaxsiy **Natijalarim**da bor.

Telegram botga guruhning avvalgi barcha a’zolari ro‘yxatini bermaydi. Shuning uchun
hisobot **Qatnashaman** bosganlar, botga guruh havolasi orqali kirganlar va bot ko‘rgan
keyingi a’zolik voqealari asosida tuziladi. Bot odamni test ishlashga majbur qila olmaydi;
u topshirmaganlarni ko‘rsatadi. Guruhdagi oddiy suhbatlar AI’ga yuborilmaydi.

Haftalik jadval har hafta navbatdagi **yangi, 50 savollik, admin tasdiqlagan** mockni oladi.
Navbat bo‘sh bo‘lsa egaga xabar beradi; savollarni o‘zi to‘qimaydi yoki eski mockni qayta yubormaydi.
Guruh ulanishini `/uzish` bilan to‘xtatish mumkin. Bu tugallanmagan mocklarni ham bekor qiladi.

## Xotira va ruxsatlar

- O‘quvchining javob rasmi RAM’da o‘qiladi; disk/Storage’ga va profilga rasm havolasi yozilmaydi.
- Javoblar, ball va xatolar tarixi saqlanadi. Telegram chatidagi rasm o‘chirilmaydi.
- Admin yuklagan savollar fayllari qayta yuborish uchun Telegram file_id ko‘rinishida saqlanadi.
- Rasm o‘qish: foydalanuvchiga kuniga 15 ta, 6 MB gacha. Matnli topshirish AI talab qilmaydi.
- Kalit rasm bilan kiritilsa admin tekshirib tasdiqlaydi. Guruhga yuboriladigan savollar fayliga kalitni qo‘shmang.
- Baza va RPC’lar faqat server roliga ochiq. Bot egasi Vault `enzo_ADMIN_IDS`ning birinchi IDsi;
  boshqa IDlar yoki eski ENZO admin rollari biologiya botiga admin huquqi bermaydi.
- Tokenlar repoga yozilmaydi. Vault sozlamalari 60 soniyagacha keshda turadi.

## Kod va tekshiruv

Jonli dastur: `src/edge/runtime.js` → `src/biology/`.
`src/storage/postgres.js` — saqlash adapteri; `bio_submit` SQL funksiyasi — atomar qabul va baholash.
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
`supabase/migrations/20261115072715_biology_mock.sql`, Vault va cron sozlamalari.
Mavjud ENZO bazasida faqat yangi biologiya migratsiyasi kerak.
Edge Function nomi va webhook URL o‘zgarmaydi: `enzo-bot`.
`npm start` eski MongoDB/ENZO serveri bo‘lib qolgan; biologiya botini u orqali ishga tushirmang.

[Supabase sozlash](docs/SUPABASE.md) · [Sinov holati](docs/TEST_STATUS.md) · [Eski ENZO qo‘llanmasi](docs/LEGACY_ENZO.md)
