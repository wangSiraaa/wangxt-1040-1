import initSqlJs, { type Database } from 'sql.js'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DB_DIR = path.join(__dirname, '..', 'data')
const DB_PATH = path.join(DB_DIR, 'carwash.db')

let db: Database | null = null

function saveDbToDisk(): void {
  if (!db) return
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(DB_PATH, buffer)
}

async function initDb(): Promise<Database> {
  const SQL = await initSqlJs()

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH)
    db = new SQL.Database(fileBuffer)
  } else {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true })
    }
    db = new SQL.Database()
  }

  db.run('PRAGMA journal_mode=WAL')
  db.run('PRAGMA foreign_keys=ON')

  createTables(db)
  migrateSchema(db)
  seedData(db)
  saveDbToDisk()

  return db
}

function createTables(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS bays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','occupied','fault','overtime')),
      current_order_id INTEGER,
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (current_order_id) REFERENCES orders(id)
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plate_number TEXT NOT NULL,
      car_type TEXT NOT NULL CHECK(car_type IN ('suv','sedan','mpv','van')),
      service_package TEXT NOT NULL CHECK(service_package IN ('standard','premium','interior','full')),
      payment_method TEXT NOT NULL CHECK(payment_method IN ('online','onsite','member')),
      payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid','paid','refunded','partial_refund')),
      base_amount INTEGER NOT NULL DEFAULT 0,
      overtime_amount INTEGER NOT NULL DEFAULT 0,
      total_amount INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','washing','completed','cancelled','transferred')),
      bay_id INTEGER,
      reservation_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      started_at TEXT,
      completed_at TEXT,
      cancelled_at TEXT,
      FOREIGN KEY (bay_id) REFERENCES bays(id)
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS queue_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      assigned_bay_id INTEGER,
      car_type TEXT NOT NULL CHECK(car_type IN ('suv','sedan','mpv','van')),
      service_package TEXT NOT NULL CHECK(service_package IN ('standard','premium','interior','full')),
      estimated_arrival_minutes INTEGER NOT NULL DEFAULT 15,
      payment_method TEXT NOT NULL CHECK(payment_method IN ('online','onsite','member')),
      position INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','called','serving','completed','cancelled','reserved','no_show','vip_skip')),
      queue_type TEXT NOT NULL DEFAULT 'normal' CHECK(queue_type IN ('normal','reservation','monthly_card','vip_skip')),
      joined_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      called_at TEXT,
      cancelled_at TEXT,
      cancel_reason TEXT,
      reserved_arrival_time TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (assigned_bay_id) REFERENCES bays(id)
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS billings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      billing_type TEXT NOT NULL CHECK(billing_type IN ('base','overtime','refund','partial_refund','transfer_refund','transfer_charge','monthly_card','no_show_fee')),
      amount INTEGER NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS faults (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bay_id INTEGER NOT NULL,
      fault_type TEXT NOT NULL CHECK(fault_type IN ('equipment','power','water','other')),
      severity TEXT NOT NULL CHECK(severity IN ('minor','major','critical')),
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','resolved')),
      estimated_loss_cents INTEGER NOT NULL DEFAULT 0,
      actual_loss_cents INTEGER NOT NULL DEFAULT 0,
      reported_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      resolved_at TEXT,
      reported_by TEXT,
      resolved_by TEXT,
      FOREIGN KEY (bay_id) REFERENCES bays(id)
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operator_role TEXT NOT NULL CHECK(operator_role IN ('staff','maintenance','system')),
      operator_name TEXT NOT NULL,
      action TEXT NOT NULL,
      target_bay_id INTEGER,
      target_order_id INTEGER,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS monthly_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plate_number TEXT NOT NULL UNIQUE,
      card_type TEXT NOT NULL CHECK(card_type IN ('basic','premium','ultimate')),
      total_washes INTEGER NOT NULL DEFAULT 0,
      remaining_washes INTEGER NOT NULL DEFAULT 0,
      total_reservations INTEGER NOT NULL DEFAULT 0,
      remaining_reservations INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','expired','frozen')),
      valid_from TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      valid_until TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plate_number TEXT NOT NULL,
      monthly_card_id INTEGER,
      car_type TEXT NOT NULL CHECK(car_type IN ('suv','sedan','mpv','van')),
      service_package TEXT NOT NULL CHECK(service_package IN ('standard','premium','interior','full')),
      reserved_time TEXT NOT NULL,
      grace_minutes INTEGER NOT NULL DEFAULT 15,
      status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','checked_in','no_show','cancelled','expired')),
      no_show_fee INTEGER NOT NULL DEFAULT 0,
      order_id INTEGER,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      checked_in_at TEXT,
      cancelled_at TEXT,
      expired_at TEXT,
      cancel_reason TEXT,
      FOREIGN KEY (monthly_card_id) REFERENCES monthly_cards(id),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS order_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fault_id INTEGER NOT NULL,
      from_order_id INTEGER NOT NULL,
      to_order_id INTEGER,
      from_bay_id INTEGER NOT NULL,
      to_bay_id INTEGER,
      transfer_type TEXT NOT NULL CHECK(transfer_type IN ('requeue','refund','new_bay','manual_confirm')),
      refund_amount INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled','awaiting_confirmation')),
      confirmed_by TEXT,
      confirmed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      notes TEXT,
      FOREIGN KEY (fault_id) REFERENCES faults(id),
      FOREIGN KEY (from_order_id) REFERENCES orders(id),
      FOREIGN KEY (to_order_id) REFERENCES orders(id)
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS timeline_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL CHECK(event_type IN (
        'queue_join','queue_call','queue_cancel','queue_no_show','queue_vip_skip',
        'reservation_create','reservation_checkin','reservation_no_show','reservation_cancel','reservation_expire',
        'wash_start','wash_complete','wash_overtime',
        'fault_report','fault_resolve','fault_transfer','fault_manual_confirm',
        'order_transfer','order_refund','order_pay',
        'bay_idle','bay_occupied','bay_fault','bay_overtime'
      )),
      bay_id INTEGER,
      order_id INTEGER,
      queue_entry_id INTEGER,
      reservation_id INTEGER,
      fault_id INTEGER,
      transfer_id INTEGER,
      event_time TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      operator_role TEXT,
      operator_name TEXT,
      details TEXT,
      metadata TEXT,
      FOREIGN KEY (bay_id) REFERENCES bays(id),
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (queue_entry_id) REFERENCES queue_entries(id),
      FOREIGN KEY (reservation_id) REFERENCES reservations(id),
      FOREIGN KEY (fault_id) REFERENCES faults(id),
      FOREIGN KEY (transfer_id) REFERENCES order_transfers(id)
    )
  `)
}

function migrateSchema(database: Database): void {
  try {
    const ordersCols = database.exec("PRAGMA table_info(orders)")
    const ordersColNames = ordersCols[0]?.values.map((r: any[]) => String(r[1])) ?? []
    if (!ordersColNames.includes('cancel_reason')) {
      database.run(`ALTER TABLE orders ADD COLUMN cancel_reason TEXT`)
    }
  } catch (_e) {
  }
}

function seedData(database: Database): void {
  const count = database.exec('SELECT COUNT(*) as cnt FROM bays')
  const rowCount = count[0]?.values[0]?.[0]
  if (rowCount && Number(rowCount) > 0) return

  const bayNames = ['1号车位', '2号车位', '3号车位', '4号车位']
  const stmt = database.prepare('INSERT INTO bays (name, status) VALUES (?, ?)')
  for (const name of bayNames) {
    stmt.run([name, 'idle'])
  }
  stmt.free()
}

export async function getDb(): Promise<Database> {
  if (db) return db
  return initDb()
}

export { saveDbToDisk }

export function queryAll(sql: string, params?: unknown[]): Record<string, unknown>[] {
  if (!db) throw new Error('Database not initialized')
  const stmt = db.prepare(sql)
  if (params && params.length > 0) {
    stmt.bind(params)
  }
  const results: Record<string, unknown>[] = []
  while (stmt.step()) {
    results.push(stmt.getAsObject())
  }
  stmt.free()
  return results
}

export function queryOne(sql: string, params?: unknown[]): Record<string, unknown> | null {
  const rows = queryAll(sql, params)
  return rows.length > 0 ? rows[0] : null
}
