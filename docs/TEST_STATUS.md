# Tekshiruv holati — 2026-10-22

- ZIPdagi dastlabki fayllar repo bilan to‘liq solishtirildi: farq yo‘q edi.
- `npm run check`: JavaScript sintaksis tekshiruvi o‘tdi.
- `npm run test:unit`: 41/41 tekshiruv o‘tdi (20 asosiy, 10 skrinshot, 11 mustaqil bot/material oqimi).
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
Jonli Telegram bot, haqiqiy ilova bazasi va hosting bilan yakuniy qabul sinovi hali bajarilmagan:
ularning sozlamalari ushbu vazifada berilmagan.

Skrinshot testlarida Gemini va Telegram tarmoq javoblari soxta sinov javoblari bilan berildi;
haqiqiy AI so‘rovi yuborilmadi. O‘qish aniqligi, ayniqsa foydalanuvchining alohida HTML
natija sahifasi bilan, namunaviy skrinshot va jonli API kaliti orqali hali tekshirilishi kerak.
Yangi MongoDB jarayonlari akkauntga tegishlilik, takroriy tasdiq, tahlil qulfini saqlash,
API orqali shaxsiy natija, AI xatosi, guruh chegarasi, qayta yuborish va kech kelgan natijani qamraydi.

Mustaqil bot testlari guruhga a’zolik, parolsiz ro‘yxatdan o‘tish, bir xil nomli guruhlarni
ajratish, HTML/audio materialini javob kalitisiz joylash, fayl → esda qolgan material →
skrinshot → tasdiq → tahlil → keyingi fayl ketma-ketligini tekshiradi. Bazasiz sinovlarda
MongoDB chaqiruvlari soxta javoblar bilan berilgan; ular haqiqiy indeks/saqlash sinovini almashtirmaydi.
