-- Run after schema.sql. Matches local Dexie seed businesses.

insert into public.businesses (id, code, name, type, email)
values
  ('biz-stay-a', 'BUS001', 'G.V Royal Residency', 'STAY', 'stay@royalresidency.local'),
  ('biz-stay-b', 'BUS002', 'G.V Cloudy Glenn Resort', 'STAY', 'stay@cloudyglenn.local'),
  ('biz-rest', 'BUS003', 'G.V Cloudy Kitchen', 'RESTAURANT', 'hello@cloudykitchen.local')
on conflict (id) do update set
  code = excluded.code,
  name = excluded.name,
  type = excluded.type,
  email = excluded.email;
