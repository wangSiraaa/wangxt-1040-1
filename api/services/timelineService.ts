import { getDb, saveDbToDisk, queryAll, queryOne } from '../database.js'

export interface TimelineEventData {
  event_type: string
  bay_id?: number | null
  order_id?: number | null
  queue_entry_id?: number | null
  reservation_id?: number | null
  fault_id?: number | null
  transfer_id?: number | null
  operator_role?: string | null
  operator_name?: string | null
  details?: string | null
  metadata?: Record<string, unknown> | null
}

export async function addTimelineEvent(data: TimelineEventData) {
  const db = await getDb()
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)

  const metadataStr = data.metadata ? JSON.stringify(data.metadata) : null

  db.run(
    `INSERT INTO timeline_events (
      event_type, bay_id, order_id, queue_entry_id, reservation_id, fault_id, transfer_id,
      event_time, operator_role, operator_name, details, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.event_type,
      data.bay_id ?? null,
      data.order_id ?? null,
      data.queue_entry_id ?? null,
      data.reservation_id ?? null,
      data.fault_id ?? null,
      data.transfer_id ?? null,
      now,
      data.operator_role ?? null,
      data.operator_name ?? null,
      data.details ?? null,
      metadataStr,
    ],
  )

  const result = db.exec('SELECT last_insert_rowid() as id')
  return Number(result[0]?.values[0]?.[0])
}

export async function getTimelineEvents(options?: {
  limit?: number
  offset?: number
  eventTypes?: string[]
  bayId?: number
  orderId?: number
  startTime?: string
  endTime?: string
}) {
  const params: unknown[] = []
  const conditions: string[] = []

  if (options?.eventTypes && options.eventTypes.length > 0) {
    const placeholders = options.eventTypes.map(() => '?').join(',')
    conditions.push(`event_type IN (${placeholders})`)
    params.push(...options.eventTypes)
  }

  if (options?.bayId) {
    conditions.push('bay_id = ?')
    params.push(options.bayId)
  }

  if (options?.orderId) {
    conditions.push('order_id = ?')
    params.push(options.orderId)
  }

  if (options?.startTime) {
    conditions.push('event_time >= ?')
    params.push(options.startTime)
  }

  if (options?.endTime) {
    conditions.push('event_time <= ?')
    params.push(options.endTime)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = options?.limit ?? 100
  const offset = options?.offset ?? 0

  const rows = queryAll(
    `SELECT te.*,
            b.name as bay_name,
            o.plate_number as order_plate,
            r.plate_number as reservation_plate
     FROM timeline_events te
     LEFT JOIN bays b ON te.bay_id = b.id
     LEFT JOIN orders o ON te.order_id = o.id
     LEFT JOIN reservations r ON te.reservation_id = r.id
     ${whereClause}
     ORDER BY te.event_time DESC, te.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  )

  return rows.map(row => ({
    ...row,
    metadata: row.metadata ? JSON.parse(String(row.metadata)) : null,
  }))
}

export async function getQueueTimeline(limit: number = 50) {
  return getTimelineEvents({
    eventTypes: [
      'queue_join', 'queue_call', 'queue_cancel', 'queue_no_show', 'queue_vip_skip',
      'reservation_create', 'reservation_checkin', 'reservation_no_show', 'reservation_cancel', 'reservation_expire',
      'wash_start', 'wash_complete',
      'fault_report', 'fault_resolve', 'fault_transfer',
      'order_transfer', 'order_refund',
    ],
    limit,
  })
}
