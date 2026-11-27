-- Staff, sessions and the audit trail ------------------------------------------------------------
create table staff (
  id             serial primary key,
  email          text not null unique,
  name           text not null,
  password_hash  text not null,
  role           text not null default 'staff' check (role in ('owner','staff')),
  disabled       boolean not null default false,
  created_at     timestamptz not null default now()
);

create table sessions (
  token_hash  text primary key,          -- sha256 of the cookie value; the cookie alone is useless if the table leaks
  staff_id    integer not null references staff(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create table audit_log (
  id          bigserial primary key,
  staff_id    integer references staff(id),
  action      text not null,             -- e.g. product.create, product.price, inventory.adjust, order.ship, ebay.connect, login.failed
  entity      text,
  entity_id   text,
  detail      jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_entity on audit_log (entity, entity_id);
create index audit_log_action_time on audit_log (action, created_at);

-- Pallets: what was bought, for how much, and what it earned -------------------------------------
create table pallets (
  id                     serial primary key,
  label                  text not null,
  supplier               text,
  purchased_on           date,
  cost_cents             integer not null default 0 check (cost_cents >= 0),
  freight_cents          integer not null default 0 check (freight_cents >= 0),
  other_cents            integer not null default 0 check (other_cents >= 0),
  manifest_retail_cents  integer,
  notes                  text,
  created_at             timestamptz not null default now()
);

-- Product details for liquidation stock ---------------------------------------------------------
alter table products
  add column description        text,
  add column brand              text,
  add column model              text,
  add column upc                text,
  add column sku                text unique,
  add column status             text not null default 'active' check (status in ('draft','active','archived')),
  add column cost_cents         integer check (cost_cents is null or cost_cents >= 0),
  add column pallet_id          integer references pallets(id) on delete set null,
  add column location           text,                -- shelf, bin or tote
  add column tested             text check (tested is null or tested in ('works','not_working','untested')),
  add column packaging          text check (packaging is null or packaging in ('original','damaged','none')),
  add column included           text,
  add column missing            text,
  add column defects            text,
  add column weight_oz          integer check (weight_oz is null or weight_oz > 0),
  add column pickup_only        boolean not null default false,
  add column sell_on_web        boolean not null default true,
  add column sell_on_ebay       boolean not null default false,
  add column ebay_price_cents   integer check (ebay_price_cents is null or ebay_price_cents >= 0),
  add column updated_at         timestamptz not null default now();
update products set sku = 'HH-' || id where sku is null;
create index products_upc on products (upc) where upc is not null;

alter table inventory_events drop constraint inventory_events_reason_check;
alter table inventory_events add constraint inventory_events_reason_check
  check (reason in ('seed','listed','sale_web','sale_ebay','sale_store','adjust','return','cancel'));
alter table inventory_events add column staff_id integer references staff(id), add column note text;
create index products_status on products (status);

create table product_images (
  id          serial primary key,
  product_id  integer not null references products(id) on delete cascade,
  path        text not null,             -- e.g. /uploads/abc-800.webp; a -400 size sits beside it
  width       integer,
  height      integer,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index product_images_product on product_images (product_id, position);

create sequence product_ids start 1000;   -- new listings; the 9 imported items keep their old ids

-- Orders from every channel ----------------------------------------------------------------------
alter table orders
  alter column email drop not null,
  alter column name drop not null,
  add column channel            text not null default 'web' check (channel in ('web','store','ebay')),
  add column external_id        text,     -- eBay order id
  add column payment_method     text,     -- in-store: cash, card, other
  add column fees_cents         integer not null default 0,
  add column fulfillment_status text not null default 'unfulfilled'
      check (fulfillment_status in ('unfulfilled','ready','picked_up','shipped','delivered','cancelled','refunded')),
  add column tracking_carrier   text,
  add column tracking_number    text,
  add column staff_id           integer references staff(id),
  add column notes              text;
alter table orders drop constraint orders_fulfillment_check;
alter table orders add constraint orders_fulfillment_check check (fulfillment in ('pickup','ship','in_store'));
create unique index orders_channel_external on orders (channel, external_id) where external_id is not null;
create index orders_status_time on orders (status, created_at desc);

-- What shoppers see, open and search for ---------------------------------------------------------
create table product_events (
  id          bigserial primary key,
  product_id  integer not null references products(id) on delete cascade,
  kind        text not null check (kind in ('impression','view','add_to_bag')),
  visitor     text,
  created_at  timestamptz not null default now()
);
create index product_events_product_kind on product_events (product_id, kind, created_at);

create table search_log (
  id          bigserial primary key,
  q           text not null,
  results     integer not null,
  created_at  timestamptz not null default now()
);

-- Background jobs (eBay publishing, syncing) -----------------------------------------------------
create table jobs (
  id          bigserial primary key,
  kind        text not null,
  payload     jsonb not null default '{}',
  status      text not null default 'queued' check (status in ('queued','processing','completed','failed','attention')),
  attempts    integer not null default 0,
  max_attempts integer not null default 5,
  run_after   timestamptz not null default now(),
  last_error  text,
  dedupe_key  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index jobs_dedupe_open on jobs (dedupe_key) where dedupe_key is not null and status in ('queued','processing');
create index jobs_ready on jobs (status, run_after);

-- eBay --------------------------------------------------------------------------------------------
create table ebay_account (
  id                   integer primary key default 1 check (id = 1),
  username             text,
  access_token_enc     text,
  access_expires_at    timestamptz,
  refresh_token_enc    text,
  refresh_expires_at   timestamptz,
  marketplace_id       text not null default 'EBAY_US',
  fulfillment_policy_id text,
  payment_policy_id    text,
  return_policy_id     text,
  location_key         text,
  markup_bps           integer not null default 0,     -- eBay price = web price + this many basis points
  markup_cents         integer not null default 0,     -- ... plus this fixed amount
  auto_list            boolean not null default false, -- new web listings also go to eBay
  connected_at         timestamptz,
  last_order_sync_at   timestamptz
);

create table ebay_listings (
  product_id     integer primary key references products(id) on delete cascade,
  sku            text not null unique,
  offer_id       text,
  listing_id     text,
  category_id    text,
  status         text not null default 'queued' check (status in ('queued','publishing','published','needs_info','failed','withdrawn')),
  quantity       integer,
  price_cents    integer,
  last_error     text,
  synced_at      timestamptz
);

create table settings (
  key    text primary key,
  value  jsonb not null
);
