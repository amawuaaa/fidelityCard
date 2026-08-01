# CupTrack

Fidelidad digital para cafeterías. Una app, muchos cafés (`?cafe=slug`).

- **Cliente:** `https://www.cuptrack.com/?cafe=cafe-demo`
- **Admin:** `https://www.cuptrack.com/#admin`

## Stack

React + Vite + Tailwind · Supabase (Auth, Postgres, Realtime) · Vercel

## Setup rápido

### 1. Variables

```bash
cp .env.example .env
```

Rellena `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.  
Para el pitch: `VITE_DEMO=true`. En producción real: `VITE_DEMO=false`.

En Vercel → Project → Settings → Environment Variables: las mismas claves.

### 2. SQL (una sola fuente de verdad)

En Supabase → **SQL Editor** → pega y ejecuta **todo**:

[`supabase/cuptrack.sql`](supabase/cuptrack.sql)

Eso crea/actualiza tablas, **RLS endurecido**, RPCs y cafés demo (Café Demo, Bean & Co, Norte, Layers, ETMA).

> Los archivos antiguos (`schema.sql`, `secure_admin.sql`, `multi_cafe.sql`, etc.) quedan como histórico. **No los re-ejecutes** después de `cuptrack.sql` (pueden reabrir permisos).

### 3. Auth barista

1. Authentication → Users → Add user (email + password)
2. (Recomendado) desactiva sign-ups públicos
3. Query **nueva**:

```sql
select public.link_staff_by_email(
  'barista@tucafe.com',
  'cafe-demo',
  'owner'
);
```

### 4. URLs Auth (dominio)

Authentication → URL Configuration:

- Site URL: `https://www.cuptrack.com`
- Redirect URLs: `https://www.cuptrack.com/**`, `https://cuptrack.com/**`, y tu `*.vercel.app/**` si lo usas

### 5. Local

```bash
npm install
npm run dev
```

## Demos (con `VITE_DEMO=true`)

| Café | URL |
|------|-----|
| Café Demo | `/?cafe=cafe-demo` |
| Bean & Co | `/?cafe=bean-co` |
| Norte | `/?cafe=norte` |
| the Layers | `/?cafe=layers` |
| ETMA Bakery | `/?cafe=etma` |

## Seguridad (resumen)

- Sellos / aprobar NFC: solo **barista autenticado** de ese café
- Cliente: `ensure_customer_session` + `create_nfc_request` + `start_new_card` (RPC)
- Tablas: sin INSERT/UPDATE/DELETE anónimo directo a sellos
- `link_staff_by_email`: solo SQL editor / service_role

## Scripts legacy

No usar en proyectos nuevos:

- `schema.sql`, `add_stamp_rpc.sql`, `card_complete_migration.sql`
- `fix_card_sync.sql`, `secure_admin.sql`, `multi_cafe.sql`, `demo_cafes.sql`
