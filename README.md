# Noor Mahal Pizza POS (Supabase + Vercel)

## Pages
- `/` (index.html)      → Billing screen. Har cashier apne username/password se login karta hai (4 systems = 4 users).
- `/admin.html`         → Admin: Dashboard, Bills, Items, Deals, Users.

## Kaise chalta hai
- Admin panel > **Users** me har system ke liye user banayen (name, username, password).
- Cashier billing screen par login kare. Bill ke upar Cashier ka naam (admin wala) aur Customer ka naam (khali ho to "Walk-in Customer") ata hai.
- Har bill ka apna **Bill ID** hota hai (NM-000001 ...). Admin > Bills me ID likh kar bill dhoond len.
- Dashboard me "All users" ya kisi ek user ko chun kar uski sale dekhen. Excel download me Bills, By user aur Items summary sheets hoti hain.

## Order type aur Tables
- Billing screen par **Take Away** ya **Delivery** chunen (Delivery me Note me address/phone likh den). Bill par type likha aata hai.
- **Tables** tab: table par click karen, items add/remove karte rahen (order Supabase me auto-save hota hai, dusre system par bhi nazar aata hai). Aakhir me **Final bill & print** dabayen, table free ho jati hai.
- Admin > **Tables** me tables add/delete/rename karen.
- **Preview bill / View** se receipt print se pehle dekh sakte hain.

## Logo
`logo.png` receipt ke top par print hota hai (aur login page par dikhta hai). Naya logo lagana ho to isi naam se file replace karen (black & white, ~600px wide best hai). Logo hatana ho to `config.js` me `LOGO: ""` kar den.

## Database
Supabase project me ye SQL files run ho chuki hain (naye project ke liye is order me chalayen):
1. `supabase.sql`
2. `supabase-v2.sql`
3. `supabase-v3-tables.sql`

User banane wali Edge Function ka naam `manage-users` hai (Supabase project me deploy hai).

## config.js
Shop name, address, phone, footer, `BILL_PREFIX`, `DEFAULT_CUSTOMER`, `PAPER` (80mm/58mm) yahan se badlen.

## Deploy
Files GitHub par push karen, Vercel automatic deploy kar deta hai.

## Thermal printer
Printer ko default banayen. Print dialog me Paper size = 80mm, Margins = None, Headers/footers = off.
Chrome ko `--kiosk-printing` ke saath chalayen to dialog ke baghair seedha print hoga.
