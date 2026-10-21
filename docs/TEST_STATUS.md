# Tekshiruv holati — 2026-10-21

- ZIPdagi dastlabki fayllar repo bilan to‘liq solishtirildi: farq yo‘q edi.
- `npm run check`: JavaScript sintaksis tekshiruvi o‘tdi.
- `npm run test:unit`: 30/30 tekshiruv o‘tdi (20 mavjud + 10 skrinshot tekshiruvi).
- React komponenti JSX parserdan o‘tdi; Mini App DOM sinovida SVG chizish, IELTS/CEFR almashtirish, HTML escaping, URLdan tokenni olish va 401 xabari tekshirildi. Skrinshotning alohida grafigi/tarixi, nol ball va rasm nomidagi HTML escaping ham tekshirildi. Bu piksel/render skrinshot tekshiruvi emas.
- `tests/workflows.test.js`: haqiqiy MongoDB bilan ishlaydigan 19 jarayon testi bor (16 mavjud + 3 skrinshot jarayoni).
- Ushbu ish muhitida MongoDB binari `open: Operation not permitted` sabab ishga tushmadi;
  shu sabab MongoDB jarayon testlari mahalliy muhitda tasdiqlanmagan.
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
