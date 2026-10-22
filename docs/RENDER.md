# Render'da mustaqil ENZO bot

Repo ildizidagi `render.yaml` ikkita xizmatni belgilaydi:

| Xizmat | Vazifasi | Tarif | Disk |
| --- | --- | --- | --- |
| `enzo-material-bot` | Doimiy Telegram worker | `0.5c-512mb` | 1 GB |
| `enzo-material-mongo` | Ichki, parolli MongoDB 7 | `0.5c-512mb` | 1 GB |

Ikkalasi Frankfurt hududida ishlaydi. MongoDB internetga ochilmaydi.
Bot diski Render yangilanishida eski process tugagandan keyingina yangi processni
ishga tushirish uchun qo'shilgan: Telegram polling va jadval bir vaqtda ikki nusxada
ishlamasligi kerak. Bot ma'lumotlari MongoDB diskida saqlanadi. Yangilanish paytida
qisqa tanaffus bo'ladi. Boshqa hostingda shu tokenli ikkinchi botni ishlatmang.

2026-10-22dagi e'lon qilingan boshlang'ich narx: har xizmat uchun oyiga $7,
har diskning 1 GB'i uchun $0.25. Shu konfiguratsiya **taxminan $14.50/oy**;
Gemini, ortiqcha trafik, yig'ish vaqti, soliq yoki workspace to'lovlari bunga kirmaydi.
Joriy narxni Apply oldidan [Render pricing](https://render.com/pricing)da tekshiring.
Bepul uxlaydigan web xizmati kunlik aniq davomat va Telegram polling talabini bajarmaydi.

## Dastlabki joylashtirish

1. To'g'ri Render workspace'ni tanlang. Mavjud xuddi shu nomli xizmat bo'lsa,
   Blueprint unga tegishi mumkin — yangi loyiha uchun nomlar band emasligini tekshiring.
2. [Blueprint yaratish](https://dashboard.render.com/blueprint/new?repo=https://github.com/egostrange316-debug/telegram-bot-)
   sahifasini oching. GitHub ulanishi so'ralsa, repo uchun ruxsat bering.
3. Branch: `claude/adoring-cray-tdkpq2`. Blueprint fayli: `render.yaml`.
4. Maxfiy maydonlarga `BOT_TOKEN`, `GEMINI_API_KEY`, `ADMIN_IDS`ni kiriting.
   `ADMIN_IDS`da bir nechta ID vergul bilan yoziladi. Kalitlarni GitHubga yozmang.
5. Ikkita xizmat, disklar va xarajatlarni ko'rib chiqing, so'ng **Apply**.
6. MongoDB va bot deploylari `live` bo'lishini kuting. Bot logida
   `Bot ishga tushdi: @...` chiqishi kerak. Faqat build tugashi bot ishladi degani emas.
7. Botda `/start`, admin menyusi, guruhga ulash, material yuborish va haqiqiy
   skrinshot bilan tekshiring. Guruh buyruqlari README'da.

Blueprint `MONGO_HOST`, port, bazaning nomi va maxfiy credential reference'larini
botga uzatadi. Kod shu qismlardan URI yasaydi; maxsus belgili parollar URL uchun
kodlanadi. Root foydalanuvchi `admin` bazasida tekshiriladi, bot yozuvlari `enzo_bot`da.
Bu usulda `MONGO_URI`ni alohida kiritmang: explicit URI reference'lardan ustuvor.
MongoDB root parolini mavjud diskda oddiy env o'zgarishi orqali almashtirmang:
initialization qiymatlari faqat bo'sh diskning birinchi ishga tushishida qo'llanadi.

## Sozlamani keyin o'zgartirish

`BOT_TOKEN`, `GEMINI_API_KEY` va `ADMIN_IDS` Render Environment sahifasida boshqariladi.
Blueprintdagi `sync: false` keyingi sync'larda ularni qayta yozmaydi.
Yangi admin qo'shganda mavjud IDlarni qoldirib, yangi IDni vergul bilan qo'shing va
**Save and deploy** qiling. Oddiy restart oldingi deploy sozlamalarini ishlatishi mumkin.

Bu worker varianti public Mini App manzilini bermaydi; natijalar, grafik rasmi va
hisobotlar bot orqali olinadi. HTML Mini App kerak bo'lsa alohida web xizmat sozlanadi.

MongoDB uchun muntazam `mongodump` backup kerak. Render disk snapshotini custom
MongoDB bazasini tiklash vositasi deb hisoblamang; provider bunday restore'ni tavsiya etmaydi.

## Tekshiruv chegarasi

Blueprintning lokal JSON Schema tekshiruvi platformadagi workspace tekshiruvini
almashtirmaydi. Render CLI va hisobga kirish mavjud bo'lganda:

```bash
render blueprints validate render.yaml --output json
```

So'ng deploy holati va jonli bot javobini tekshirish kerak.
