# Tekshiruv holati — 2026-10-21

- ZIPdagi dastlabki fayllar repo bilan to‘liq solishtirildi: farq yo‘q edi.
- `npm run check`: JavaScript sintaksis tekshiruvi o‘tdi.
- `npm run test:unit`: 20/20 tekshiruv o‘tdi.
- React komponenti JSX parserdan o‘tdi; Mini App DOM sinovida SVG chizish, IELTS/CEFR almashtirish, HTML escaping, URLdan tokenni olish va 401 xabari tekshirildi. Bu piksel/render skrinshot tekshiruvi emas.
- `tests/workflows.test.js`: haqiqiy MongoDB bilan ishlaydigan 16 jarayon testi qo‘shilgan.
- Ushbu ish muhitida MongoDB binari `open: Operation not permitted` sabab ishga tushmadi;
  shu sabab 16 jarayon testi mahalliy muhitda tasdiqlanmagan.
- [GitHub Actions urinishida](https://github.com/egostrange316-debug/telegram-bot-/actions/runs/39532863675)
  GitHub akkaunt billing muammosi tufayli jobni boshlamadi. Bu test assertion xatosi emas.

Billing cheklovi bartaraf etilgach Actions orqali qayta ishga tushiring yoki kompyuteringizda
`npm ci && npm test` bajaring. Testlar alohida `enzo_bot_test` bazasini ishlatadi.
Jonli Telegram bot, haqiqiy ilova bazasi va hosting bilan yakuniy qabul sinovi hali bajarilmagan:
ularning sozlamalari ushbu vazifada berilmagan.
