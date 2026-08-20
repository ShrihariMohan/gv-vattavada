import { GLOBAL_EXPENSE_CATEGORIES } from "./rules";
import { hashPasswordSync } from "./rules";
import { emptyState } from "./service";
import { KITCHEN_MENU, MENU_CATEGORY_NAMES, categoryNameFromTags } from "@/marketing/menu";
import type { AppState, Business, Product, Room, User } from "./types";

function utc(iso: string) {
  return iso;
}

export function createSeedState(deviceId = "DEVICE-RESTAURANT-TABLET-01"): AppState {
  const state = emptyState(deviceId);
  const t = "2026-08-19T10:00:00.000Z";
  const meta = (id: string) => ({
    id,
    server_id: id,
    sync_status: "SYNCED" as const,
    created_at: t,
    updated_at: t,
    deleted_at: null,
    device_id: deviceId,
    version: 1,
  });

  const stayA: Business = {
    ...meta("biz-stay-a"),
    name: "G.V Royal Residency",
    type: "STAY",
    code: "BUS001",
    address: "Koviloor Bus Stand, Munnar, Idukki, Kerala 685505",
    phone: "+91 86089 33892, +91 88382 67578",
    email: "stay@royalresidency.local",
    currency: "INR",
    timezone: "Asia/Kolkata",
    gstin: "32AAAAA0000A1Z5",
    logo_url: null,
    active: true,
  };
  const stayB: Business = {
    ...meta("biz-stay-b"),
    name: "G.V Cloudy Glenn Resort",
    type: "STAY",
    code: "BUS002",
    address: "Vattavada, Munnar, Idukki, Kerala 685505",
    phone: "+91 86089 33892, +91 88382 67578",
    email: "stay@cloudyglenn.local",
    currency: "INR",
    timezone: "Asia/Kolkata",
    gstin: null,
    logo_url: null,
    active: true,
  };
  const restaurant: Business = {
    ...meta("biz-rest"),
    name: "G.V Cloudy Kitchen",
    type: "RESTAURANT",
    code: "BUS003",
    address: "Urkadu, Vattavada, Munnar, Idukki, Kerala 685505",
    phone: "+91 86089 33892, +91 87545 04478, +91 88382 67578",
    email: "hello@cloudykitchen.local",
    currency: "INR",
    timezone: "Asia/Kolkata",
    gstin: "32BBBBB0000B1Z5",
    logo_url: null,
    active: true,
  };
  state.businesses = [stayA, stayB, restaurant];

  const mkUser = (id: string, username: string, password: string, name: string, role: User["role"]): User => ({
    id,
    username,
    password_salt: "vattavada-salt",
    password_hash: hashPasswordSync(password, "vattavada-salt"),
    name,
    role,
    active: true,
    created_at: t,
  });
  state.users = [
    mkUser("user-admin", "admin", "admin123", "Admin", "ADMIN"),
    mkUser("user-manager", "manager", "manager123", "Manager", "MANAGER"),
    mkUser("user-staff", "staff", "staff123", "Kitchen staff", "STAFF"),
    mkUser("user-rm", "kitchen.manager", "kitchen123", "Kitchen manager", "RESTAURANT_MANAGER"),
    mkUser("user-rs", "kitchen.staff", "kstaff123", "Kitchen floor", "RESTAURANT_STAFF"),
    mkUser("user-sm", "stay.manager", "stay123", "Stay manager", "STAY_MANAGER"),
    mkUser("user-ss", "stay.staff", "sstaff123", "Stay desk", "STAY_STAFF"),
  ];
  state.devices = [
    { id: "DEVICE-RESTAURANT-TABLET-01", name: "Restaurant Tablet", created_at: t },
    { id: "DEVICE-STAY-A-MOBILE-01", name: "Stay A Mobile", created_at: t },
  ];

  state.customers = [
    { ...meta("cust-1"), name: "Arun Kumar", phone: "9876543210", email: "arun@example.com", address: "Munnar", notes: "Repeat guest" },
    { ...meta("cust-2"), name: "Walk-in", phone: "", email: "", address: "", notes: "" },
  ];

  state.roomTypes = [
    { id: "rt-std", business_id: stayA.id, name: "Standard", capacity: 2, base_price_paise: 350000 },
    { id: "rt-dlx", business_id: stayA.id, name: "Deluxe", capacity: 3, base_price_paise: 450000 },
    { id: "rt-b", business_id: stayB.id, name: "Valley Room", capacity: 2, base_price_paise: 300000 },
  ];

  const room = (id: string, biz: string, type: string, number: string, name: string, price: number, status: Room["status"]): Room => ({
    ...meta(id),
    business_id: biz,
    room_type_id: type,
    number,
    name,
    capacity: 2,
    base_price_paise: price,
    status,
  });
  state.rooms = [
    room("r-101", stayA.id, "rt-std", "101", "Garden 101", 350000, "OCCUPIED"),
    room("r-102", stayA.id, "rt-std", "102", "Garden 102", 350000, "AVAILABLE"),
    room("r-103", stayA.id, "rt-dlx", "103", "Valley 103", 450000, "RESERVED"),
    room("r-104", stayA.id, "rt-dlx", "104", "Valley 104", 450000, "AVAILABLE"),
    room("r-201", stayB.id, "rt-b", "201", "Mist 201", 300000, "AVAILABLE"),
    room("r-202", stayB.id, "rt-b", "202", "Mist 202", 300000, "AVAILABLE"),
  ];

  state.productCategories = MENU_CATEGORY_NAMES.map((name, i) => ({
    id: `cat-${i}`,
    business_id: restaurant.id,
    name,
    display_order: i,
  }));

  state.products = KITCHEN_MENU.map((p, i) => {
    const cat = state.productCategories.find((c) => c.name === categoryNameFromTags(p.tags))!;
    const prod: Product = {
      ...meta(p.id),
      business_id: restaurant.id,
      category_id: cat.id,
      name: p.name,
      price_paise: p.rupees * 100,
      tax_bps: 500,
      unit: "pc",
      sku: p.id.toUpperCase(),
      description: p.description,
      image_url: p.image,
      tags: [...p.tags],
      active: true,
      display_order: i,
    };
    return prod;
  });

  state.tables = [1, 2, 3, 4, 5].map((n) => ({
    ...meta(`table-${n}`),
    business_id: restaurant.id,
    name: `Table ${n}`,
    status: n === 2 || n === 3 ? "OCCUPIED" : n === 5 ? "RESERVED" : "AVAILABLE",
    current_order_id: n === 2 ? "ord-open" : n === 3 ? "ord-held" : null,
  }));

  state.orders = [
    {
      ...meta("ord-open"),
      business_id: restaurant.id,
      table_id: "table-2",
      customer_id: "cust-1",
      guest_name: "Arun Kumar",
      guest_phone: "9876543210",
      room_number: "101",
      status: "IN_PROGRESS",
      notes: "",
    },
    {
      ...meta("ord-held"),
      business_id: restaurant.id,
      table_id: "table-3",
      customer_id: "cust-2",
      guest_name: "Walk-in",
      guest_phone: "",
      room_number: "",
      status: "HELD",
      notes: "",
    },
  ];
  state.orderItems = [
    {
      ...meta("oi-1"),
      order_id: "ord-open",
      product_id: "p-parotta",
      name: "Parotta 1 piece",
      qty: 2,
      unit_price_paise: 1500,
      tax_bps: 500,
    },
    {
      ...meta("oi-2"),
      order_id: "ord-open",
      product_id: "p-chicken",
      name: "Chicken curry",
      qty: 1,
      unit_price_paise: 14000,
      tax_bps: 500,
    },
  ];

  state.expenseCategories = GLOBAL_EXPENSE_CATEGORIES.map((name, i) => ({ id: `ec-${i}`, name }));

  state.bookings = [
    {
      ...meta("bk-1"),
      business_id: stayA.id,
      customer_id: "cust-1",
      room_id: "r-101",
      check_in: "2026-08-18",
      check_out: "2026-08-21",
      adults: 2,
      children: 0,
      rate_paise: 350000,
      extra_charges_paise: 0,
      food_paise: 80000,
      extra_bed_paise: 0,
      activities_paise: 0,
      other_income_paise: 0,
      discount_paise: 0,
      tax_paise: 0,
      total_paise: 350000 * 3 + 80000,
      paid_paise: 500000,
      balance_paise: 350000 * 3 + 80000 - 500000,
      status: "CHECKED_IN",
      notes: "",
    },
    {
      ...meta("bk-2"),
      business_id: stayA.id,
      customer_id: "cust-1",
      room_id: "r-103",
      check_in: "2026-08-20",
      check_out: "2026-08-22",
      adults: 2,
      children: 1,
      rate_paise: 450000,
      extra_charges_paise: 0,
      food_paise: 0,
      extra_bed_paise: 0,
      activities_paise: 0,
      other_income_paise: 0,
      discount_paise: 0,
      tax_paise: 0,
      total_paise: 900000,
      paid_paise: 200000,
      balance_paise: 700000,
      status: "RESERVED",
      notes: "",
    },
  ];

  state.invoices = [
    {
      ...meta("inv-hist-1"),
      business_id: restaurant.id,
      customer_id: "cust-2",
      order_id: null,
      booking_id: null,
      invoice_number: "RES-2026-000101",
      invoice_type: "RESTAURANT",
      business_date: "2026-08-19",
      subtotal_paise: 131000,
      discount_paise: 0,
      tax_paise: 6550,
      total_paise: 137550,
      paid_amount_paise: 137550,
      balance_amount_paise: 0,
      payment_status: "PAID",
      status: "ISSUED",
      notes: "seed",
    },
    {
      ...meta("inv-hist-2"),
      business_id: stayA.id,
      customer_id: "cust-1",
      order_id: null,
      booking_id: "bk-1",
      invoice_number: "STAY-2026-000010",
      invoice_type: "STAY",
      business_date: "2026-08-18",
      subtotal_paise: 850000,
      discount_paise: 0,
      tax_paise: 0,
      total_paise: 850000,
      paid_amount_paise: 500000,
      balance_amount_paise: 350000,
      payment_status: "PARTIAL",
      status: "ISSUED",
      notes: "seed",
    },
    {
      ...meta("inv-hist-3"),
      business_id: stayB.id,
      customer_id: "cust-1",
      order_id: null,
      booking_id: null,
      invoice_number: "STAY-2026-000011",
      invoice_type: "STAY",
      business_date: "2026-08-19",
      subtotal_paise: 620000,
      discount_paise: 0,
      tax_paise: 0,
      total_paise: 620000,
      paid_amount_paise: 620000,
      balance_amount_paise: 0,
      payment_status: "PAID",
      status: "ISSUED",
      notes: "seed",
    },
  ];
  state.invoiceItems = [
    { ...meta("ii-1"), invoice_id: "inv-hist-1", name: "Parotta", qty: 4, unit_price_paise: 1500, amount_paise: 6000 },
    { ...meta("ii-2"), invoice_id: "inv-hist-1", name: "Chicken Curry", qty: 2, unit_price_paise: 18000, amount_paise: 36000 },
    { ...meta("ii-3"), invoice_id: "inv-hist-1", name: "Tea", qty: 4, unit_price_paise: 2000, amount_paise: 8000 },
  ];
  state.payments = [
    {
      ...meta("pay-1"),
      business_id: restaurant.id,
      invoice_id: "inv-hist-1",
      booking_id: null,
      customer_id: "cust-2",
      amount_paise: 137550,
      method: "UPI",
      business_date: "2026-08-19",
      notes: "",
    },
    {
      ...meta("pay-2"),
      business_id: stayA.id,
      invoice_id: "inv-hist-2",
      booking_id: "bk-1",
      customer_id: "cust-1",
      amount_paise: 500000,
      method: "CASH",
      business_date: "2026-08-18",
      notes: "advance",
    },
  ];
  state.expenses = [
    {
      ...meta("ex-1"),
      business_id: restaurant.id,
      category: "Vegetables",
      amount_paise: 80000,
      payment_method: "CASH",
      business_date: "2026-08-18",
      description: "Morning market",
      vendor: "Local vendor",
      attachment: null,
    },
    {
      ...meta("ex-2"),
      business_id: stayB.id,
      category: "Electricity",
      amount_paise: 120000,
      payment_method: "BANK_TRANSFER",
      business_date: "2026-08-18",
      description: "KSEB",
      vendor: "KSEB",
      attachment: null,
    },
  ];
  state.ledger = [
    {
      ...meta("led-1"),
      business_id: restaurant.id,
      type: "SALE",
      amount_paise: 137550,
      business_date: "2026-08-19",
      description: "Invoice RES-2026-000101",
      ref_id: "inv-hist-1",
      ref_type: "invoice",
    },
    {
      ...meta("led-2"),
      business_id: stayA.id,
      type: "BOOKING",
      amount_paise: 850000,
      business_date: "2026-08-18",
      description: "Stay booking",
      ref_id: "bk-1",
      ref_type: "booking",
    },
    {
      ...meta("led-3"),
      business_id: restaurant.id,
      type: "EXPENSE",
      amount_paise: -80000,
      business_date: "2026-08-18",
      description: "Morning market",
      ref_id: "ex-1",
      ref_type: "expense",
    },
    {
      ...meta("led-4"),
      business_id: stayB.id,
      type: "EXPENSE",
      amount_paise: -120000,
      business_date: "2026-08-18",
      description: "KSEB",
      ref_id: "ex-2",
      ref_type: "expense",
    },
  ];
  state.lastSyncedAt = utc("2026-08-19T09:42:00.000Z");
  return state;
}
