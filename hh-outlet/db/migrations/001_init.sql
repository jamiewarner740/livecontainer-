-- Products and the stock that every sales channel draws from.
create table products (
  id            integer primary key,
  slug          text not null unique,
  name          text not null,
  price_cents   integer not null check (price_cents >= 0),
  retail_cents  integer check (retail_cents is null or retail_cents >= 0),
  stock         integer not null check (stock >= 0),          -- units on hand
  category      text not null,
  image         text not null,
  alt           text not null,
  condition     text,                                          -- null until the owner records it
  active        boolean not null default true,
  added_at      timestamptz not null default now()
);

create table orders (
  id              uuid primary key default gen_random_uuid(),
  number          bigserial unique,
  access_token    text not null,                               -- lets the buyer view the order without an account
  status          text not null default 'pending_payment' check (status in ('pending_payment','paid','cancelled','expired')),
  email           text not null,
  name            text not null,
  phone           text,
  fulfillment     text not null check (fulfillment in ('pickup','ship')),
  ship_address1   text, ship_address2 text, ship_city text, ship_state text, ship_zip text,
  subtotal_cents  integer not null,
  shipping_cents  integer not null,
  tax_cents       integer not null,
  total_cents     integer not null,
  payment_provider text,
  payment_id      text,
  created_at      timestamptz not null default now(),
  paid_at         timestamptz
);

create table order_items (
  order_id     uuid not null references orders(id) on delete cascade,
  product_id   integer not null references products(id),
  name         text not null,
  price_cents  integer not null,
  qty          integer not null check (qty > 0),
  primary key (order_id, product_id)
);

-- A hold on stock while a buyer pays. Available = stock - active, unexpired holds.
create table reservations (
  id          bigserial primary key,
  order_id    uuid not null references orders(id) on delete cascade,
  product_id  integer not null references products(id),
  qty         integer not null check (qty > 0),
  expires_at  timestamptz not null,
  status      text not null default 'active' check (status in ('active','committed','released'))
);
create index reservations_active on reservations (product_id) where status = 'active';

-- Every change to stock, with why it happened.
create table inventory_events (
  id          bigserial primary key,
  product_id  integer not null references products(id),
  delta       integer not null,
  reason      text not null check (reason in ('seed','sale_web','sale_ebay','sale_store','adjust','return')),
  order_id    uuid references orders(id),
  created_at  timestamptz not null default now()
);

create table payment_attempts (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references orders(id) on delete cascade,
  provider            text not null,
  amount_cents        integer not null,
  status              text not null check (status in ('started','succeeded','failed')),
  provider_payment_id text,
  error               text,
  created_at          timestamptz not null default now()
);
