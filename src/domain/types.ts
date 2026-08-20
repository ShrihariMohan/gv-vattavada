export type BusinessType = "STAY" | "RESTAURANT";
export type Role =
  | "ADMIN"
  | "MANAGER"
  | "STAFF"
  | "RESTAURANT_MANAGER"
  | "RESTAURANT_STAFF"
  | "STAY_MANAGER"
  | "STAY_STAFF";
export type SyncStatus =
  | "PENDING"
  | "SYNCING"
  | "SYNCED"
  | "FAILED"
  | "RETRY"
  | "CONFLICT";
export type SyncOperation = "CREATE" | "UPDATE" | "DELETE";
export type PaymentMethod = "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "OTHER";
export type PaymentStatus = "UNPAID" | "PARTIAL" | "PAID" | "REFUNDED";
export type InvoiceStatus = "DRAFT" | "ISSUED" | "VOIDED" | "CANCELLED" | "REVERSED";
export type InvoiceType = "RESTAURANT" | "STAY";
export type OrderStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "PAID"
  | "CANCELLED"
  | "HELD";
export type TableStatus = "AVAILABLE" | "OCCUPIED" | "RESERVED";
export type RoomStatus =
  | "AVAILABLE"
  | "OCCUPIED"
  | "RESERVED"
  | "CLEANING"
  | "MAINTENANCE"
  | "BLOCKED";
export type BookingStatus =
  | "ENQUIRY"
  | "RESERVED"
  | "CHECKED_IN"
  | "CHECKED_OUT"
  | "CANCELLED"
  | "NO_SHOW";
export type LedgerType = "SALE" | "BOOKING" | "EXPENSE" | "PAYMENT" | "REFUND" | "ADJUSTMENT";
export type EntityType =
  | "business"
  | "customer"
  | "product"
  | "invoice"
  | "invoice_item"
  | "payment"
  | "booking"
  | "expense"
  | "order"
  | "order_item"
  | "room"
  | "table"
  | "shift"
  | "daily_closing"
  | "user";

export interface SyncMeta {
  id: string;
  server_id: string | null;
  sync_status: SyncStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  device_id: string;
  version: number;
}

export interface Business extends SyncMeta {
  name: string;
  type: BusinessType;
  code: string;
  address: string;
  phone: string;
  email: string;
  currency: string;
  timezone: string;
  gstin: string | null;
  logo_url: string | null;
  active: boolean;
}

export interface User {
  id: string;
  username: string;
  password_hash: string;
  password_salt: string;
  name: string;
  role: Role;
  active: boolean;
  created_at: string;
}

export interface Device {
  id: string;
  name: string;
  created_at: string;
}

export interface Customer extends SyncMeta {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

export interface GuestProfile {
  id_type: string | null;
  id_number_last4: string | null;
  adults: number;
  children: number;
}

export interface RoomType {
  id: string;
  business_id: string;
  name: string;
  capacity: number;
  base_price_paise: number;
}

export interface Room extends SyncMeta {
  business_id: string;
  room_type_id: string;
  number: string;
  name: string;
  capacity: number;
  base_price_paise: number;
  status: RoomStatus;
}

export interface Booking extends SyncMeta {
  business_id: string;
  customer_id: string;
  room_id: string;
  check_in: string;
  check_out: string;
  adults: number;
  children: number;
  rate_paise: number;
  extra_charges_paise: number;
  food_paise: number;
  extra_bed_paise: number;
  activities_paise: number;
  other_income_paise: number;
  discount_paise: number;
  tax_paise: number;
  total_paise: number;
  paid_paise: number;
  balance_paise: number;
  status: BookingStatus;
  notes: string;
}

export interface ProductCategory {
  id: string;
  business_id: string;
  name: string;
  display_order: number;
}

export interface Product extends SyncMeta {
  business_id: string;
  category_id: string;
  name: string;
  price_paise: number;
  tax_bps: number;
  unit: string;
  sku: string;
  active: boolean;
  display_order: number;
}

export interface RestaurantTable extends SyncMeta {
  business_id: string;
  name: string;
  status: TableStatus;
  current_order_id: string | null;
}

export interface Order extends SyncMeta {
  business_id: string;
  table_id: string | null;
  customer_id: string | null;
  guest_name: string;
  guest_phone: string;
  room_number: string;
  status: OrderStatus;
  notes: string;
}

export interface OrderItem extends SyncMeta {
  order_id: string;
  product_id: string;
  name: string;
  qty: number;
  unit_price_paise: number;
  tax_bps: number;
}

export interface Invoice extends SyncMeta {
  business_id: string;
  customer_id: string | null;
  order_id: string | null;
  booking_id: string | null;
  invoice_number: string;
  invoice_type: InvoiceType;
  business_date: string;
  subtotal_paise: number;
  discount_paise: number;
  tax_paise: number;
  total_paise: number;
  paid_amount_paise: number;
  balance_amount_paise: number;
  payment_status: PaymentStatus;
  status: InvoiceStatus;
  notes: string;
}

export interface InvoiceItem extends SyncMeta {
  invoice_id: string;
  name: string;
  qty: number;
  unit_price_paise: number;
  amount_paise: number;
}

export interface Payment extends SyncMeta {
  business_id: string;
  invoice_id: string | null;
  booking_id: string | null;
  customer_id: string | null;
  amount_paise: number;
  method: PaymentMethod;
  business_date: string;
  notes: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
}

export interface Expense extends SyncMeta {
  business_id: string;
  category: string;
  amount_paise: number;
  payment_method: PaymentMethod;
  business_date: string;
  description: string;
  vendor: string;
  attachment: string | null;
}

export interface LedgerEntry extends SyncMeta {
  business_id: string;
  type: LedgerType;
  amount_paise: number;
  business_date: string;
  description: string;
  ref_id: string;
  ref_type: string;
}

export interface DailyClosing extends SyncMeta {
  business_id: string;
  business_date: string;
  cash_sales_paise: number;
  upi_sales_paise: number;
  card_sales_paise: number;
  expected_cash_paise: number;
  actual_cash_paise: number;
  difference_paise: number;
  closed_by: string;
  status: "CLOSED" | "REOPENED";
  reopened_at: string | null;
  reopen_reason: string;
}

export interface Shift extends SyncMeta {
  business_id: string;
  name: string;
  opened_at: string;
  closed_at: string | null;
  opening_cash_paise: number;
  sales_paise: number;
  expenses_paise: number;
  closing_cash_paise: number | null;
  difference_paise: number | null;
}

export interface AuditLog {
  id: string;
  who: string;
  action: string;
  entity_type: string;
  entity_id: string;
  when: string;
  device_id: string;
  old_value: string | null;
  new_value: string | null;
}

export interface SyncQueueItem {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  operation: SyncOperation;
  payload: string;
  status: "Pending" | "Syncing" | "Failed";
  retry_count: number;
  last_error: string | null;
  created_at: string;
  synced_at: string | null;
  depends_on: string[];
}

export interface InvoiceCounter {
  key: string;
  seq: number;
}

export interface ConflictRecord {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  local_payload: string;
  remote_payload: string;
  resolved: boolean;
  created_at: string;
}

export interface AppState {
  businesses: Business[];
  users: User[];
  devices: Device[];
  customers: Customer[];
  roomTypes: RoomType[];
  rooms: Room[];
  bookings: Booking[];
  productCategories: ProductCategory[];
  products: Product[];
  tables: RestaurantTable[];
  orders: Order[];
  orderItems: OrderItem[];
  invoices: Invoice[];
  invoiceItems: InvoiceItem[];
  payments: Payment[];
  expenseCategories: ExpenseCategory[];
  expenses: Expense[];
  ledger: LedgerEntry[];
  dailyClosings: DailyClosing[];
  shifts: Shift[];
  auditLogs: AuditLog[];
  syncQueue: SyncQueueItem[];
  invoiceCounters: InvoiceCounter[];
  conflicts: ConflictRecord[];
  lastSyncedAt: string | null;
  currentUserId: string | null;
  currentDeviceId: string;
  online: boolean;
}
