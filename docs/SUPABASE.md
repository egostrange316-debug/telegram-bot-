# ENZO — Supabase Free

## Ishlaydigan arxitektura

Telegram → maxfiy sarlavha bilan `/functions/v1/enzo-bot/webhook` → Postgres navbati →
bot handlerlari. Telegram faqat yangilanish bazaga yozilgandan keyin 200 oladi.
Funksiya fonda navbatni ishlaydi. Cron har daqiqada navbatni qayta tekshiradi va
Toshkent vaqti bo‘yicha davomat / to‘lov hisobotlarini boshlaydi. Xabar jo‘natish
va bazaga qayd yozish orasida uzilish bo‘lsa Telegram’da takror xabar bo‘lishi mumkin.

`enzo_documents_store` existing bot document shapes are stored as JSONB, with database
unique indexes for students, links, attendance, pending analyses and screenshot hashes.
The adapter supports the operations used by standalone handlers; it is not a general
MongoDB replacement and does not implement the legacy app leaderboard aggregation.
`STANDALONE=true` is fixed in the Edge bundle; app login / Express Mini App API is not hosted here.

Data and RPCs are server-only: RLS enabled, no anon/authenticated grants, service_role access.
Telegram webhook and Cron have different secrets and authenticate in the function body,
so `[functions.enzo-bot] verify_jwt = false` is intentional.

## Qayta joylashtirish

1. Supabase Free tashkilotida alohida loyiha oching. Mavjud pullik tashkilotga
   joylashtirish xarajat keltirishi mumkin; loyiha narxini tekshiring.
2. `supabase/migrations/*_enzo_standalone.sql` migrationini yangi bazaga qo‘llang.
   `supabase/sql/schema.sql` shu sxemaning o‘qish/test uchun nusxasi; ikkalasini ketma-ket ishlatmang.
3. Dashboard → SQL Editor’da Vault `vault.create_secret` orqali quyidagilarni kiriting.
   Qiymatlar source yoki migrationga yozilmaydi.

| Vault nomi | Qiymat |
|---|---|
| `enzo_BOT_TOKEN` | Telegram bot tokeni |
| `enzo_GEMINI_API_KEY` | Gemini API kaliti |
| `enzo_ADMIN_IDS` | Admin Telegram IDlari, vergul bilan |
| `enzo_GEMINI_SCREENSHOT_MODEL` | `gemini-3.1-flash-lite` yoki mos rasm/JSON modeli |
| `enzo_WEBHOOK_SECRET` | Tasodifiy 32+ belgili maxfiy qiymat |
| `enzo_CRON_SECRET` | Boshqa tasodifiy 32+ belgili maxfiy qiymat |
| `enzo_PROJECT_URL` | `https://PROJECT_REF.supabase.co` |

4. `npm ci && npm run build:edge`. `supabase/functions/enzo-bot` ichidagi to‘rtta faylni
   deploy qiling: `index.ts`, `runtime.mjs`, `handler.mjs`, `deno.json`.
   CLI uchun avval `npx supabase functions deploy --help` bilan flaglarni tekshiring.
5. Funksiyaning `/health` manzili 200 berishi kerak. `/webhook` ruxsatsiz so‘rovga 401 beradi.
6. `supabase/sql/cron.sql`ni SQL Editor’da bir marta bajaring. Qayta bajarish mavjud
   shu nomli jadvalni yangilaydi. `net._http_response`da Cron javobi 202 bo‘lishini tekshiring.
7. Telegram `setWebhook` orqali URLni `https://PROJECT_REF.supabase.co/functions/v1/enzo-bot/webhook`
   qiling, `secret_token`ga `enzo_WEBHOOK_SECRET`, `max_connections`ga `1` bering.
   `allowed_updates`: `message`, `callback_query`, `my_chat_member`, `chat_member`.
   Tokenni URL bilan terminal loglariga chiqarmang. Mavjud yangilanishlarni tashlab yubormang.
8. `/start` → guruhga botni admin qilish → `/ulash 1-guruh` → materiallarni joylash.

Fayl/audio Telegram `file_id` orqali yuboriladi; katta audiofayllar Supabase bazasiga yuklanmaydi.
Skrinshot RAM orqali Gemini’ga yuboriladi. Bot o‘quvchining rasmdagi tayyor ballini o‘qiydi.

## Admin qo‘shish va kalitni almashtirish

Dashboard → SQL Editor’da kerakli Vault yozuvini yangilang (misoldagi IDlarni o‘zingiznikiga almashtiring):

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'enzo_ADMIN_IDS'),
  '111111111,222222222'
);
```

Mavjud adminlarni ro‘yxatda qoldiring. O‘zgarish keyingi so‘rovlarda 60 soniya ichida olinadi.
Yangi admin botga `/start` yuborishi va guruhni ulash uchun Telegram guruhida ham admin bo‘lishi kerak.
Bot tokeni / Gemini kalitini ham tegishli Vault yozuvida shu usulda almashtirish mumkin.
Webhook secret o‘zgarsa Telegram `setWebhook`dagi `secret_token`ni ham yangilang.

## Tekshirish va cheklovlar

- `npm run test:unit`: handler autentifikatsiyasi, navbatga yozish, skrinshot va tahlil qoidalari.
- `npm run test:postgres`: alohida, xotiradagi PGlite Postgres bazasida to‘liq material/natija/davomat oqimi.
  Telegram va Gemini mock; jonli bazaga yoki foydalanuvchilarga xabar yubormaydi.
- `tests/postgres.integration.sql`: yangi, bo‘sh sinov loyihasida SQL/RLS/constraint/navbat sinovi;
  fixturelar transaction oxirida rollback qilinadi. Ishlayotgan navbat ustida ishlatmang.
- `enzo_updates`da `failed` holati besh muvaffaqiyatsiz urinishdan keyin qoladi. `last_error`
  faqat umumiy xato kodidir. Bot foydalanuvchisidan amalni qayta yuborishni so‘rash mumkin.
- Cron aniqligi taxminan bir daqiqa; xizmatdagi uzilishlardan so‘ng hisobotlar 20 daqiqalik
  tiklash oynasida qayta uriniladi. Bepul tarif uzluksiz ishlash kafolati bermaydi.
- Har kuni eskirgan session/draftlar tozalanadi. Tugallangan Telegram payloadi darhol o‘chiriladi,
  deduplikatsiya IDsi 7 kun saqlanadi. Tasdiqlangan o‘quvchi natijalari saqlanib qoladi.
- Supabase Free resurs kvotalari bor va faol bo‘lmagan loyihalar pauzaga tushishi mumkin.
  Gemini tarifi/kvotasi hostingdan alohida. Paid tarifga avtomatik o‘tish sozlanmagan.

Manbalar: [Supabase Free](https://supabase.com/pricing),
[Edge secrets](https://supabase.com/docs/guides/functions/secrets),
[Cron](https://supabase.com/docs/guides/functions/schedule-functions),
[Vault](https://supabase.com/docs/guides/database/vault).

## Joriy loyiha uchun eslatma

Supabase advisor `pg_net` public sxemada o‘rnatilganini ogohlantirdi
([izoh](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public)).
Bu extension `relocatable=false`; uni drop/recreate qilish ishlayotgan Cron HTTP
navbatiga ta’sir qilishi mumkin. Avtomatik approval review shu almashtirishni rad etdi,
shuning uchun mavjud extension va ishlayotgan jadval saqlandi. Yangi loyihalar uchun
`cron.sql` extensionni boshidanoq `extensions` sxemasida yaratishni ko‘rsatadi.

Jonli Edge Functionni fixture sinovi bilan vaqtincha almashtirish ham avtomatik review
tomonidan rad etildi. To‘liq oqim alohida mahalliy PGlite bazasiga ko‘chirildi; jonli
funksiya almashtirilmadi va fixture yozuvlari ishlab turgan bazaga kiritilmadi.
