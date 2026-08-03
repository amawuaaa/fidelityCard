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

| Entorno | `VITE_DEMO` |
|---------|-------------|
| Pitch / demos | `true` |
| Café en producción | `false` |

En Vercel → Settings → Environment Variables: las mismas claves.

### 2. SQL

**Proyecto nuevo:** ejecuta todo [`supabase/cuptrack.sql`](supabase/cuptrack.sql).

**Proyecto que ya tenía `cuptrack.sql`:** ejecuta además (en orden):

1. [`supabase/hardening_v2.sql`](supabase/hardening_v2.sql) — anti-spam NFC (si aún no)  
2. [`supabase/cancel_nfc.sql`](supabase/cancel_nfc.sql) — cancelar petición  
3. [`supabase/remove_stamp.sql`](supabase/remove_stamp.sql) — si aún no lo tienes  
4. [`supabase/hardening_v3.sql`](supabase/hardening_v3.sql) — **seguridad + código corto de caja** (obligatorio)  
5. [`supabase/fix_claim_token.sql`](supabase/fix_claim_token.sql) — si ves `gen_random_bytes does not exist` (PWA iPhone)  
6. [`supabase/rename_demo_targets.sql`](supabase/rename_demo_targets.sql) — si aún tienes demos `layers`/`etma` públicos

`hardening_v3` cierra lecturas anónimas, añade `claim_token` y código de 4 dígitos por café.

> No re-ejecutes scripts LEGACY (`schema.sql`, `secure_admin.sql`, etc.).

### 3. Auth barista (importante)

1. Authentication → Users → Add user (email + password)
2. **Authentication → Providers → Email → desactiva “Allow new users to sign up”**  
   (nadie se registra solo desde la web)
3. Query nueva:

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
| Prism Café (demo rainbow) | `/?cafe=prism` |
| Hearth Bakery (demo bakery) | `/?cafe=hearth` |

> No uses marcas reales de clientes en demos públicos. Si tenías `layers`/`etma`, ejecuta [`supabase/rename_demo_targets.sql`](supabase/rename_demo_targets.sql).

## Seguridad (resumen)

- Sellos / aprobar / quitar: solo **barista autenticado** de ese café
- Cliente: RPCs `ensure_customer_session`, `create_nfc_request`, `start_new_card`
- IDs `usr_` opacos (hex); NFC: 1 pendiente por cliente + caduca a las 2h
- Staff ve solo NFC/tarjetas de su café; anon no lista historial NFC antiguo
- `link_staff_by_email`: solo SQL editor / service_role

## Scripts legacy

No usar en proyectos nuevos:

- `schema.sql`, `add_stamp_rpc.sql`, `card_complete_migration.sql`
- `fix_card_sync.sql`, `secure_admin.sql`, `multi_cafe.sql`, `demo_cafes.sql`
