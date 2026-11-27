-- eBay order lines need their eBay line item id to report shipments back.
alter table order_items add column external_line_id text;

-- Where eBay should say the item ships from (required by eBay before anything can be listed).
alter table ebay_account
  add column location_postal text,
  add column location_city   text,
  add column location_state  text,
  add column last_quantity_check_at timestamptz;

-- When an eBay sale can't be fully covered by stock here (it sold on both channels at once), it is recorded and
-- shown to the owner instead of silently going negative.
create table oversells (
  id           bigserial primary key,
  product_id   integer not null references products(id),
  order_id     uuid references orders(id),
  wanted       integer not null,
  had          integer not null,
  resolved     boolean not null default false,
  created_at   timestamptz not null default now()
);
