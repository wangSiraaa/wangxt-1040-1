import { getDb, saveDbToDisk, queryAll, queryOne } from '../database.js'
import {
  RESERVATION_GRACE_MINUTES,
  RESERVATION_MAX_AHEAD_DAYS,
  RESERVATION_TIME_SLOT_MINUTES,
  RESERVATION_MAX_SLOTS_PER_BAY,
  calculateBaseAmount,
  calculateNoShowFee,
} from '../config.js'
import { addLog } from './operationLogService.js'
import { addTimelineEvent } from './timelineService.js'
import { getMonthlyCard, useReservation, checkMonthlyCardEligibility } from './monthlyCardService.js'
import { joinQueue } from './queueService.js'

export interface CreateReservationData {
  plate_number: string
  car_type: string
  service_package: string
  reserved_time: string
  grace_minutes?: number
  created_by?: string
}

export interface CheckInReservationData {
  reservation_id: number
  operator_name?: string
}

export async function getReservation(id: number) {
  return queryOne('SELECT * FROM reservations WHERE id = ?', [id])
}

export async function getReservationsByPlate(plateNumber: string, status?: string) {
  if (status) {
    return queryAll(
      'SELECT * FROM reservations WHERE plate_number = ? AND status = ? ORDER BY reserved_time DESC',
      [plateNumber, status],
    )
  }
  return queryAll(
    'SELECT * FROM reservations WHERE plate_number = ? ORDER BY reserved_time DESC',
    [plateNumber],
  )
}

export async function getAvailableTimeSlots(date: string) {
  const db = await getDb()

  const startOfDay = `${date} 00:00:00`
  const endOfDay = `${date} 23:59:59`

  const reservations = queryAll(
    `SELECT reserved_time, COUNT(*) as cnt 
     FROM reservations 
     WHERE status = 'reserved' AND reserved_time >= ? AND reserved_time <= ?
     GROUP BY reserved_time`,
    [startOfDay, endOfDay],
  )

  const bays = queryAll("SELECT COUNT(*) as cnt FROM bays WHERE status != 'fault'")
  const activeBayCount = Number(bays[0]?.cnt ?? 0)
  const maxPerSlot = Math.max(activeBayCount, 1) * RESERVATION_MAX_SLOTS_PER_BAY

  const slots: { time: string; available: number; total: number }[] = []
  const startHour = 8
  const endHour = 22

  for (let hour = startHour; hour < endHour; hour++) {
    for (let min = 0; min < 60; min += RESERVATION_TIME_SLOT_MINUTES) {
      const timeStr = `${date} ${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:00`
      const reserved = Number(reservations.find(r => String(r.reserved_time) === timeStr)?.cnt ?? 0)
      slots.push({
        time: timeStr,
        available: Math.max(0, maxPerSlot - reserved),
        total: maxPerSlot,
      })
    }
  }

  return slots
}

export async function createReservation(data: CreateReservationData) {
  const db = await getDb()

  const reservedDate = new Date(data.reserved_time)
  const now = new Date()
  const maxAheadDate = new Date(now.getTime() + RESERVATION_MAX_AHEAD_DAYS * 24 * 60 * 60 * 1000)

  if (reservedDate < now) {
    throw new Error('预约时间不能早于当前时间')
  }
  if (reservedDate > maxAheadDate) {
    throw new Error(`最多只能提前${RESERVATION_MAX_AHEAD_DAYS}天预约`)
  }

  const eligibility = await checkMonthlyCardEligibility(data.plate_number)
  if (!eligibility.eligible) {
    throw new Error(eligibility.reasons.join('; '))
  }

  const monthlyCard = eligibility.card!
  if (Number(monthlyCard.remaining_reservations) <= 0) {
    throw new Error('月卡预约次数已用完')
  }

  const activeReservations = queryAll(
    `SELECT * FROM reservations 
     WHERE plate_number = ? AND status = 'reserved' AND reserved_time >= ?`,
    [data.plate_number, now.toISOString().replace('T', ' ').slice(0, 19)],
  )
  if (activeReservations.length > 0) {
    throw new Error('您已有未使用的预约，请先完成或取消')
  }

  const graceMinutes = data.grace_minutes ?? RESERVATION_GRACE_MINUTES
  const baseAmount = calculateBaseAmount(data.car_type, data.service_package)
  const noShowFee = calculateNoShowFee(baseAmount)
  const nowStr = now.toISOString().replace('T', ' ').slice(0, 19)

  db.run(
    `INSERT INTO reservations (
      plate_number, monthly_card_id, car_type, service_package,
      reserved_time, grace_minutes, status, no_show_fee, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'reserved', ?, ?, ?)`,
    [
      data.plate_number,
      Number(monthlyCard.id),
      data.car_type,
      data.service_package,
      data.reserved_time,
      graceMinutes,
      noShowFee,
      data.created_by ?? 'user',
      nowStr,
    ],
  )

  const result = db.exec('SELECT last_insert_rowid() as id')
  const reservationId = Number(result[0]?.values[0]?.[0])

  await useReservation(Number(monthlyCard.id))

  saveDbToDisk()

  await addTimelineEvent({
    event_type: 'reservation_create',
    reservation_id: reservationId,
    operator_role: 'system',
    operator_name: data.created_by ?? 'user',
    details: `车牌${data.plate_number}预约${data.reserved_time}，宽限${graceMinutes}分钟`,
    metadata: {
      car_type: data.car_type,
      service_package: data.service_package,
      no_show_fee: noShowFee,
    },
  })

  await addLog({
    operator_role: 'system',
    operator_name: data.created_by ?? 'user',
    action: 'create_reservation',
    details: `车牌${data.plate_number}创建预约#${reservationId}，时间${data.reserved_time}`,
  })

  return {
    id: reservationId,
    plate_number: data.plate_number,
    reserved_time: data.reserved_time,
    grace_minutes: graceMinutes,
    no_show_fee: noShowFee,
    status: 'reserved',
  }
}

export async function checkInReservation(data: CheckInReservationData) {
  const db = await getDb()
  const reservation = await getReservation(data.reservation_id)

  if (!reservation) {
    throw new Error('预约记录不存在')
  }

  if (reservation.status !== 'reserved') {
    throw new Error(`预约状态为${reservation.status}，无法签到`)
  }

  const reservedTime = new Date(String(reservation.reserved_time))
  const graceMinutes = Number(reservation.grace_minutes)
  const now = new Date()
  const graceEndTime = new Date(reservedTime.getTime() + graceMinutes * 60 * 1000)

  const nowStr = now.toISOString().replace('T', ' ').slice(0, 19)

  if (now > graceEndTime) {
    return await markNoShow(data.reservation_id, data.operator_name ?? 'system')
  }

  db.run(
    "UPDATE reservations SET status = 'checked_in', checked_in_at = ? WHERE id = ?",
    [nowStr, data.reservation_id],
  )

  const plateNumber = String(reservation.plate_number)
  const carType = String(reservation.car_type)
  const servicePackage = String(reservation.service_package)

  const queueResult = await joinQueue({
    plate_number: plateNumber,
    car_type: carType,
    service_package: servicePackage,
    payment_method: 'member',
  })

  db.run(
    'UPDATE orders SET reservation_id = ? WHERE id = ?',
    [data.reservation_id, queueResult.orderId],
  )

  db.run(
    "UPDATE queue_entries SET queue_type = 'monthly_card', reserved_arrival_time = ? WHERE id = ?",
    [String(reservation.reserved_time), queueResult.queueEntryId],
  )

  saveDbToDisk()

  await addTimelineEvent({
    event_type: 'reservation_checkin',
    reservation_id: data.reservation_id,
    order_id: queueResult.orderId,
    queue_entry_id: queueResult.queueEntryId,
    operator_role: 'staff',
    operator_name: data.operator_name ?? 'system',
    details: `预约#${data.reservation_id}签到成功，已加入排队#${queueResult.queueEntryId}`,
    metadata: {
      order_id: queueResult.orderId,
      position: queueResult.position,
    },
  })

  await addLog({
    operator_role: 'staff',
    operator_name: data.operator_name ?? 'system',
    action: 'checkin_reservation',
    target_order_id: queueResult.orderId,
    details: `预约#${data.reservation_id}签到，车牌${plateNumber}，排队位置${queueResult.position}`,
  })

  return {
    reservationId: data.reservation_id,
    orderId: queueResult.orderId,
    queueEntryId: queueResult.queueEntryId,
    position: queueResult.position,
    status: 'checked_in',
  }
}

export async function markNoShow(reservationId: number, operatorName: string = 'system') {
  const db = await getDb()
  const reservation = await getReservation(reservationId)

  if (!reservation) {
    throw new Error('预约记录不存在')
  }

  if (reservation.status !== 'reserved' && reservation.status !== 'expired') {
    throw new Error(`预约状态为${reservation.status}，无法标记爽约`)
  }

  const noShowFee = Number(reservation.no_show_fee)
  const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19)

  db.run(
    "UPDATE reservations SET status = 'no_show', expired_at = ? WHERE id = ?",
    [nowStr, reservationId],
  )

  if (noShowFee > 0) {
    db.run(
      `INSERT INTO billings (order_id, billing_type, amount, description)
       VALUES (?, 'no_show_fee', ?, ?)`,
      [
        reservation.order_id ?? 0,
        noShowFee,
        `预约爽约扣费¥${(noShowFee / 100).toFixed(2)}`,
      ],
    )
  }

  saveDbToDisk()

  await addTimelineEvent({
    event_type: 'reservation_no_show',
    reservation_id: reservationId,
    operator_role: 'system',
    operator_name: operatorName,
    details: `预约#${reservationId}爽约，扣费¥${(noShowFee / 100).toFixed(2)}`,
    metadata: { no_show_fee: noShowFee },
  })

  await addLog({
    operator_role: 'system',
    operator_name: operatorName,
    action: 'reservation_no_show',
    details: `预约#${reservationId}爽约，车牌${reservation.plate_number}，扣费¥${(noShowFee / 100).toFixed(2)}`,
  })

  return { reservationId, status: 'no_show', noShowFee }
}

export async function cancelReservation(reservationId: number, reason: string, operatorName: string = 'user') {
  const db = await getDb()
  const reservation = await getReservation(reservationId)

  if (!reservation) {
    throw new Error('预约记录不存在')
  }

  if (reservation.status !== 'reserved') {
    throw new Error(`预约状态为${reservation.status}，无法取消`)
  }

  const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const monthlyCardId = reservation.monthly_card_id ? Number(reservation.monthly_card_id) : null

  db.run(
    "UPDATE reservations SET status = 'cancelled', cancelled_at = ?, cancel_reason = ? WHERE id = ?",
    [nowStr, reason, reservationId],
  )

  saveDbToDisk()

  await addTimelineEvent({
    event_type: 'reservation_cancel',
    reservation_id: reservationId,
    operator_role: 'system',
    operator_name: operatorName,
    details: `预约#${reservationId}取消，原因: ${reason}`,
  })

  await addLog({
    operator_role: 'system',
    operator_name: operatorName,
    action: 'cancel_reservation',
    details: `预约#${reservationId}取消，原因: ${reason}`,
  })

  return { reservationId, status: 'cancelled' }
}

export async function checkAndExpireReservations() {
  const db = await getDb()
  const now = new Date()
  const nowStr = now.toISOString().replace('T', ' ').slice(0, 19)

  const expiredReservations = queryAll(
    `SELECT * FROM reservations 
     WHERE status = 'reserved' 
     AND datetime(reserved_time, '+' || grace_minutes || ' minutes') < ?`,
    [nowStr],
  )

  let expiredCount = 0
  for (const r of expiredReservations) {
    try {
      await markNoShow(Number(r.id), 'system')
      expiredCount++
    } catch (e) {
      console.error(`[Reservation] Failed to mark no-show for reservation #${r.id}:`, e)
    }
  }

  if (expiredCount > 0) {
    console.log(`[Reservation] Auto-expired ${expiredCount} reservation(s) as no-show`)
  }

  return { expiredCount, noShowCount: expiredCount }
}

export async function vipSkipLine(reservationId: number, operatorName: string = 'system') {
  const db = await getDb()
  const reservation = await getReservation(reservationId)

  if (!reservation) {
    throw new Error('预约记录不存在')
  }

  if (reservation.status !== 'checked_in') {
    throw new Error('需要先签到才能使用免排特权')
  }

  const qe = queryOne(
    'SELECT * FROM queue_entries WHERE status = \'waiting\' AND order_id = ?',
    [reservation.order_id],
  )

  if (!qe) {
    throw new Error('未找到对应的排队记录')
  }

  const qeId = Number(qe.id)
  const currentPos = Number(qe.position)

  if (currentPos <= 1) {
    throw new Error('已在队首，无需免排')
  }

  db.run(
    "UPDATE queue_entries SET position = 1, queue_type = 'vip_skip', status = 'vip_skip' WHERE id = ?",
    [qeId],
  )

  db.run(
    "UPDATE queue_entries SET position = position + 1 WHERE status = 'waiting' AND id != ? AND position < ?",
    [qeId, currentPos],
  )

  saveDbToDisk()

  await addTimelineEvent({
    event_type: 'queue_vip_skip',
    queue_entry_id: qeId,
    order_id: Number(reservation.order_id),
    reservation_id: reservationId,
    operator_role: 'staff',
    operator_name: operatorName,
    details: `月卡免排特权，车牌${reservation.plate_number}从位置${currentPos}跳到队首`,
    metadata: { from_position: currentPos, to_position: 1 },
  })

  await addLog({
    operator_role: 'staff',
    operator_name: operatorName,
    action: 'vip_skip_line',
    target_order_id: Number(reservation.order_id),
    details: `月卡免排，订单#${reservation.order_id}从位置${currentPos}跳到队首`,
  })

  return { queueEntryId: qeId, fromPosition: currentPos, toPosition: 1 }
}

export async function listReservations(status?: string, startDate?: string, endDate?: string) {
  const params: unknown[] = []
  const conditions: string[] = []

  if (status) {
    conditions.push('status = ?')
    params.push(status)
  }
  if (startDate) {
    conditions.push('reserved_time >= ?')
    params.push(startDate)
  }
  if (endDate) {
    conditions.push('reserved_time <= ?')
    params.push(endDate)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  return queryAll(
    `SELECT r.*, mc.card_type as monthly_card_type
     FROM reservations r
     LEFT JOIN monthly_cards mc ON r.monthly_card_id = mc.id
     ${whereClause}
     ORDER BY r.reserved_time DESC`,
    params,
  )
}
