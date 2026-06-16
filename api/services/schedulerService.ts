import { getDb, saveDbToDisk, queryAll } from '../database.js'
import { LATE_THRESHOLD_MINUTES, OVERTIME_INTERVAL_MINUTES, OVERTIME_RATE_PER_INTERVAL, OVERTIME_MAX_CHARGE } from '../config.js'
import { addLog } from './operationLogService.js'

let schedulerRunning = false
let lateCheckInterval: NodeJS.Timeout | null = null
let overtimeCheckInterval: NodeJS.Timeout | null = null
let saveInterval: NodeJS.Timeout | null = null

const LATE_CHECK_INTERVAL_MS = 30000
const OVERTIME_CHECK_INTERVAL_MS = 60000
const SAVE_INTERVAL_MS = 10000

export async function startScheduler(): Promise<void> {
  if (schedulerRunning) return
  schedulerRunning = true

  await getDb()
  console.log('[Scheduler] Background scheduler starting...')

  lateCheckInterval = setInterval(() => {
    void checkLateArrivals().catch(err => console.error('[Scheduler] Late check error:', err))
  }, LATE_CHECK_INTERVAL_MS)

  overtimeCheckInterval = setInterval(() => {
    void checkOvertimeWashes().catch(err => console.error('[Scheduler] Overtime check error:', err))
  }, OVERTIME_CHECK_INTERVAL_MS)

  saveInterval = setInterval(() => {
    try {
      saveDbToDisk()
    } catch (err) {
      console.error('[Scheduler] Save DB error:', err)
    }
  }, SAVE_INTERVAL_MS)

  void checkLateArrivals()
  void checkOvertimeWashes()

  console.log('[Scheduler] Scheduler started successfully')
}

export function stopScheduler(): void {
  if (lateCheckInterval) clearInterval(lateCheckInterval)
  if (overtimeCheckInterval) clearInterval(overtimeCheckInterval)
  if (saveInterval) clearInterval(saveInterval)
  lateCheckInterval = null
  overtimeCheckInterval = null
  saveInterval = null
  schedulerRunning = false
  console.log('[Scheduler] Scheduler stopped')
}

async function checkLateArrivals(): Promise<void> {
  const db = await getDb()
  const now = new Date()

  const waitingEntries = queryAll(
    `SELECT qe.id, qe.order_id, qe.position, qe.estimated_arrival_minutes, qe.joined_at, o.plate_number
     FROM queue_entries qe
     JOIN orders o ON qe.order_id = o.id
     WHERE qe.status = 'waiting'`,
  )

  let cancelledCount = 0

  for (const entry of waitingEntries) {
    const joinedAt = new Date(String(entry.joined_at))
    const estArrivalMin = Number(entry.estimated_arrival_minutes) || 15
    const expectedArrivalTime = new Date(joinedAt.getTime() + estArrivalMin * 60 * 1000)
    const cancelThreshold = new Date(expectedArrivalTime.getTime() + LATE_THRESHOLD_MINUTES * 60 * 1000)

    if (now > cancelThreshold) {
      const qeId = Number(entry.id)
      const orderId = Number(entry.order_id)
      const position = Number(entry.position)
      const plateNumber = String(entry.plate_number)
      const nowStr = now.toISOString().replace('T', ' ').slice(0, 19)

      db.run(
        "UPDATE queue_entries SET status = 'cancelled', cancelled_at = ?, cancel_reason = ? WHERE id = ?",
        [nowStr, `迟到超过${LATE_THRESHOLD_MINUTES}分钟自动取消`, qeId],
      )

      db.run(
        "UPDATE orders SET status = 'cancelled', cancelled_at = ? WHERE id = ?",
        [nowStr, orderId],
      )

      db.run(
        "UPDATE queue_entries SET position = position - 1 WHERE status = 'waiting' AND position > ?",
        [position],
      )

      cancelledCount++

      await addLog({
        operator_role: 'system',
        operator_name: 'system',
        action: 'auto_cancel_late',
        target_order_id: orderId,
        details: `车牌${plateNumber}迟到超过${LATE_THRESHOLD_MINUTES}分钟，自动取消排队`,
      })
    }
  }

  if (cancelledCount > 0) {
    saveDbToDisk()
    console.log(`[Scheduler] Auto-cancelled ${cancelledCount} late arrival(s)`)
  }
}

async function checkOvertimeWashes(): Promise<void> {
  const db = await getDb()
  const now = new Date()

  const washingOrders = queryAll(
    `SELECT o.id, o.bay_id, o.started_at, o.overtime_amount, o.total_amount, o.base_amount, o.service_package, o.car_type,
            b.status as bay_status
     FROM orders o
     JOIN bays b ON o.bay_id = b.id
     WHERE o.status = 'washing' AND o.started_at IS NOT NULL`,
  )

  let chargedCount = 0

  for (const order of washingOrders) {
    const startedAt = new Date(String(order.started_at))
    const washMinutes = (now.getTime() - startedAt.getTime()) / 60000
    const packageDuration = getPackageDuration(String(order.service_package), String(order.car_type))

    if (washMinutes > packageDuration) {
      const overtimeMinutes = washMinutes - packageDuration
      const expectedCharges = Math.floor(overtimeMinutes / OVERTIME_INTERVAL_MINUTES) * OVERTIME_RATE_PER_INTERVAL
      const cappedCharges = Math.min(expectedCharges, OVERTIME_MAX_CHARGE)
      const currentOvertime = Number(order.overtime_amount) || 0

      if (cappedCharges > currentOvertime && cappedCharges <= OVERTIME_MAX_CHARGE) {
        const additionalCharge = cappedCharges - currentOvertime
        const orderId = Number(order.id)
        const bayId = Number(order.bay_id)
        const newOvertime = cappedCharges
        const newTotal = Number(order.base_amount) + newOvertime
        const nowStr = now.toISOString().replace('T', ' ').slice(0, 19)

        db.run(
          'UPDATE orders SET overtime_amount = ?, total_amount = ? WHERE id = ?',
          [newOvertime, newTotal, orderId],
        )

        db.run(
          `INSERT INTO billings (order_id, billing_type, amount, description)
           VALUES (?, 'overtime', ?, ?)`,
          [orderId, additionalCharge, `系统自动超时加收${additionalCharge}元（累计超时${Math.floor(overtimeMinutes)}分钟）`],
        )

        if (String(order.bay_status) !== 'overtime') {
          db.run(
            "UPDATE bays SET status = 'overtime', updated_at = ? WHERE id = ?",
            [nowStr, bayId],
          )
        }

        chargedCount++

        await addLog({
          operator_role: 'system',
          operator_name: 'system',
          action: 'auto_overtime_charge',
          target_order_id: orderId,
          target_bay_id: bayId,
          details: `订单#${orderId}超时${Math.floor(overtimeMinutes)}分钟，自动加收${additionalCharge}元（累计${newOvertime}元）`,
        })
      }
    }
  }

  if (chargedCount > 0) {
    saveDbToDisk()
    console.log(`[Scheduler] Auto-charged overtime for ${chargedCount} order(s)`)
  }
}

function getPackageDuration(servicePackage: string, carType: string): number {
  const baseDurations: Record<string, number> = {
    standard: 10,
    premium: 20,
    interior: 25,
    full: 35,
  }
  const carSurchargeMin: Record<string, number> = {
    sedan: 0,
    suv: 3,
    mpv: 5,
    van: 7,
  }
  return (baseDurations[servicePackage] ?? 10) + (carSurchargeMin[carType] ?? 0)
}
