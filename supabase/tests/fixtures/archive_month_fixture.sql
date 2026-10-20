-- Fixture: one archivable month (July 2026) plus a carried-over invoice paid in August.
set client_min_messages = warning;
update public.feature_flags set enabled = true where key = 'dual_write';
-- July 2026 (outside the live window when "today" is Oct 2026) and August 2026 data.
do $$
declare r jsonb;
begin
  r := public.sync_apply_batch($j$[
    {"mutation_id":"a1","entity_type":"room","entity_id":"r1","operation":"CREATE","payload":{"id":"r1","business_id":"biz-stay-a","number":"101","capacity":2,"base_price_paise":250000,"status":"AVAILABLE","version":1}},
    {"mutation_id":"a2","entity_type":"booking","entity_id":"bk1","operation":"CREATE","payload":{"id":"bk1","business_id":"biz-stay-a","room_id":"r1","check_in":"2026-07-10","check_out":"2026-07-12","rate_paise":250000,"total_paise":500000,"paid_paise":500000,"status":"CHECKED_OUT","version":1}},
    {"mutation_id":"a3","entity_type":"product","entity_id":"p_tea","operation":"CREATE","payload":{"id":"p_tea","business_id":"biz-rest","name":"Tea","price_paise":2000,"active":true,"version":1}},
    {"mutation_id":"a4","entity_type":"product","entity_id":"p_cake","operation":"CREATE","payload":{"id":"p_cake","business_id":"biz-rest","name":"Cake","price_paise":9000,"active":true,"version":1}},
    {"mutation_id":"a5","entity_type":"order","entity_id":"o_jul","operation":"CREATE","payload":{"id":"o_jul","business_id":"biz-rest","status":"PAID","created_at":"2026-07-05T07:30:00.000Z","version":1}},
    {"mutation_id":"a6","entity_type":"order_item","entity_id":"oi_jul","operation":"CREATE","payload":{"id":"oi_jul","order_id":"o_jul","product_id":"p_tea","name":"Tea","qty":3,"unit_price_paise":2000,"version":1}},
    {"mutation_id":"a7","entity_type":"invoice","entity_id":"i_jul","operation":"CREATE","payload":{"id":"i_jul","business_id":"biz-rest","order_id":"o_jul","invoice_number":"R-10","invoice_type":"RESTAURANT","business_date":"2026-07-05","subtotal_paise":6000,"total_paise":6000,"paid_amount_paise":6000,"balance_amount_paise":0,"payment_status":"PAID","status":"ISSUED","created_at":"2026-07-05T07:30:00.000Z","version":1}},
    {"mutation_id":"a8","entity_type":"invoice_item","entity_id":"ii_jul","operation":"CREATE","payload":{"id":"ii_jul","invoice_id":"i_jul","name":"Tea","qty":3,"unit_price_paise":2000,"amount_paise":6000,"version":1}},
    {"mutation_id":"a9","entity_type":"payment","entity_id":"pay_jul","operation":"CREATE","payload":{"id":"pay_jul","business_id":"biz-rest","invoice_id":"i_jul","amount_paise":6000,"method":"CASH","business_date":"2026-07-05","version":1}},
    {"mutation_id":"a10","entity_type":"ledger","entity_id":"l_jul","operation":"CREATE","payload":{"id":"l_jul","business_id":"biz-rest","type":"SALE","amount_paise":6000,"business_date":"2026-07-05","ref_id":"i_jul","ref_type":"invoice","version":1}},
    {"mutation_id":"a11","entity_type":"expense","entity_id":"e_jul","operation":"CREATE","payload":{"id":"e_jul","business_id":"biz-rest","category":"Gas","amount_paise":1000,"payment_method":"CASH","business_date":"2026-07-06","version":1}},
    {"mutation_id":"a12","entity_type":"invoice","entity_id":"i_carry","operation":"CREATE","payload":{"id":"i_carry","business_id":"biz-rest","invoice_number":"R-11","invoice_type":"RESTAURANT","business_date":"2026-07-31","subtotal_paise":9000,"total_paise":9000,"paid_amount_paise":9000,"balance_amount_paise":0,"payment_status":"PAID","status":"ISSUED","created_at":"2026-07-31T14:00:00.000Z","version":1}},
    {"mutation_id":"a13","entity_type":"invoice_item","entity_id":"ii_carry","operation":"CREATE","payload":{"id":"ii_carry","invoice_id":"i_carry","name":"Cake","qty":1,"unit_price_paise":9000,"amount_paise":9000,"version":1}},
    {"mutation_id":"a14","entity_type":"payment","entity_id":"pay_aug","operation":"CREATE","payload":{"id":"pay_aug","business_id":"biz-rest","invoice_id":"i_carry","amount_paise":9000,"method":"UPI","business_date":"2026-08-01","version":1}}
  ]$j$::jsonb, 'devA', 'test');
  assert (select bool_and(x ->> 'status' = 'SYNCED' and x ->> 'note' is null) from jsonb_array_elements(r) x), r::text;
end $$;

