import { getDb, saveDbToDisk, queryAll, queryOne } from '../database.js'
import { calculateBaseAmount } from '../config.js'
import { addLog } from './operationLogService.js'

export interface JoinQueueData {
  plate_number: string
  car_type: string
  service_package: string
  payment_method: string
  estimated_arrival_minutes?: number
}

export async function checkEligibility(
  carType: string,
  servicePackage: string,
  paymentMethod: string,
  plateNumber?: string,
  estimatedArrivalMinutes?: number,
) {
  const db = await getDb()
  const reasons: string[] = []
  const warnings: string[] = []

  const bayResult = db.exec(
    "SELECT status, COUNT(*) as cnt FROM bays GROUP BY status",
  )
  const bayCounts: Record<string, number> = {}
  if (bayResult[0]) {
    for (const row of bayResult[0].values) {
      bayCounts[String(row[0])] = Number(row[1])
    }
  }
  const idleCount = bayCounts['idle'] ?? 0
  const faultCount = bayCounts['fault'] ?? 0
  const occupiedCount = bayCounts['occupied'] ?? 0
  const overtimeCount = bayCounts['overtime'] ?? 0
  const totalBays = idleCount + faultCount + occupiedCount + overtimeCount

  const queueWaitingResult = db.exec(
    "SELECT COUNT(*) as cnt FROM queue_entries WHERE status = 'waiting'",
  )
  const waitingCount = Number(queueWaitingResult[0]?.values[0]?.[0] ?? 0)

  if (totalBays === 0) {
    reasons.push('系统中没有可用车位')
  } else if (idleCount === 0 && waitingCount >= totalBays * 2) {
    reasons.push(`当前排队人数过多（${waitingCount}人），暂不可排队，请稍后再试`)
  }

  if (faultCount > 0 && faultCount >= totalBays) {
    reasons.push(`所有${totalBays}个车位均存在故障，暂不可排队`)
  } else if (faultCount > 0 && idleCount === 0) {
    warnings.push(`当前有${faultCount}个车位故障，空闲车位为0，可能需要等待较长时间`)
  }

  if (overtimeCount > 0) {
    warnings.push(`${overtimeCount}个车位已超时，可能影响排队进度`)
  }

  if (plateNumber) {
    const activeRow = queryOne(
      `SELECT COUNT(*) as cnt FROM orders
       WHERE plate_number = ? AND status IN ('queued', 'washing') AND payment_status = 'unpaid'`,
      [plateNumber],
    )
    const activeUnpaid = Number(activeRow?.cnt ?? 0)
    if (activeUnpaid > 0) {
      reasons.push(`该车牌（${plateNumber}）存在未支付的活跃订单，请先完成支付`)
    }

    const queuedRow = queryOne(
      `SELECT COUNT(*) as cnt FROM orders o
       JOIN queue_entries qe ON o.id = qe.order_id
       WHERE o.plate_number = ? AND qe.status IN ('waiting', 'called')`,
      [plateNumber],
    )
    const alreadyQueued = Number(queuedRow?.cnt ?? 0)
    if (alreadyQueued > 0) {
      reasons.push(`该车牌（${plateNumber}）已在排队中，不可重复排队`)
    }
  }

  if (estimatedArrivalMinutes !== undefined && estimatedArrivalMinutes > 0) {
    const maxArrival = 60
    if (estimatedArrivalMinutes > maxArrival) {
      reasons.push(`预计到店时间不能超过${maxArrival}分钟`)
    }
    if (estimatedArrivalMinutes < 5) {
      warnings.push('预计到店时间过短，建议预留充足时间')
    }
  }

  const validCarTypes = ['sedan', 'suv', 'mpv', 'van']
  if (!validCarTypes.includes(carType)) {
    reasons.push(`无效的车型: ${carType}`)
  }

  const validPackages = ['standard', 'premium', 'interior', 'full']
  if (!validPackages.includes(servicePackage)) {
    reasons.push(`无效的服务套餐: ${servicePackage}`)
  }

  const validPayments = ['online', 'onsite', 'member']
  if (!validPayments.includes(paymentMethod)) {
    reasons.push(`无效的支付方式: ${paymentMethod}`)
  }

  if (paymentMethod === 'onsite' && waitingCount > 5) {
    warnings.push('选择到店支付可能需要在洗车前排队完成付款，建议线上支付加速入场')
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    warnings,
    bayStatus: { idle: idleCount, occupied: occupiedCount, fault: faultCount, overtime: overtimeCount, total: totalBays },
    queueLength: waitingCount,
  }
}

export async function joinQueue(data: JoinQueueData) {
  const db = await getDb()

  const eligibility = await checkEligibility(
    data.car_type,
    data.service_package,
    data.payment_method,
    data.plate_number,
  )
  if (!eligibility.eligible) {
    throw new Error(eligibility.reasons.join('; '))
  }

  const baseAmount = calculateBaseAmount(data.car_type, data.service_package)

  db.run(
    `INSERT INTO orders (plate_number, car_type, service_package, payment_method, base_amount, overtime_amount, total_amount, status)
     VALUES (?, ?, ?, ?, ?, 0, ?, 'queued')`,
    [data.plate_number, data.car_type, data.service_package, data.payment_method, baseAmount, baseAmount],
  )

  const orderResult = db.exec('SELECT last_insert_rowid() as id')
  const orderId = Number(orderResult[0]?.values[0]?.[0])

  db.run(
    `INSERT INTO billings (order_id, billing_type, amount, description)
     VALUES (?, 'base', ?, ?)`,
    [orderId, baseAmount, `${data.service_package}套餐基础费用`],
  )

  const posResult = db.exec(
    "SELECT COALESCE(MAX(position), 0) + 1 as next_pos FROM queue_entries WHERE status IN ('waiting', 'called')",
  )
  const nextPos = Number(posResult[0]?.values[0]?.[0] ?? 1)

  const arrival = data.estimated_arrival_minutes ?? 15

  db.run(
    `INSERT INTO queue_entries (order_id, car_type, service_package, estimated_arrival_minutes, payment_method, position, status)
     VALUES (?, ?, ?, ?, ?, ?, 'waiting')`,
    [orderId, data.car_type, data.service_package, arrival, data.payment_method, nextPos],
  )

  const qeResult = db.exec('SELECT last_insert_rowid() as id')
  const queueEntryId = Number(qeResult[0]?.values[0]?.[0])

  saveDbToDisk()

  await addLog({
    operator_role: 'system',
    operator_name: 'system',
    action: 'join_queue',
    target_order_id: orderId,
    details: `车牌${data.plate_number}加入排队，位置${nextPos}`,
  })

  return { orderId, queueEntryId, position: nextPos, baseAmount }
}

export async function getQueue() {
  return queryAll(
    `SELECT qe.*, o.plate_number, o.base_amount, o.total_amount
     FROM queue_entries qe
     JOIN orders o ON qe.order_id = o.id
     WHERE qe.status IN ('waiting', 'called')
     ORDER BY qe.position ASC`,
  )
}

export async function callNext() {
  const db = await getDb()

  const bayResult = db.exec(
    "SELECT id, name FROM bays WHERE status = 'idle' ORDER BY id ASC LIMIT 1",
  )
  if (!bayResult[0] || bayResult[0].values.length === 0) {
    throw new Error('没有空闲车位可用')
  }
  const bayId = Number(bayResult[0].values[0][0])
  const bayName = String(bayResult[0].values[0][1])

  const nextResult = db.exec(
    `SELECT qe.id, qe.order_id, qe.position FROM queue_entries qe
     WHERE qe.status = 'waiting'
     ORDER BY qe.position ASC LIMIT 1`,
  )
  if (!nextResult[0] || nextResult[0].values.length === 0) {
    throw new Error('排队中没有等待中的车辆')
  }
  const qeId = Number(nextResult[0].values[0][0])
  const orderId = Number(nextResult[0].values[0][1])

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)

  db.run(
    `UPDATE queue_entries SET status = 'called', assigned_bay_id = ?, called_at = ? WHERE id = ?`,
    [bayId, now, qeId],
  )

  db.run(
    "UPDATE bays SET status = 'occupied', current_order_id = ?, updated_at = ? WHERE id = ?",
    [orderId, now, bayId],
  )

  db.run(
    "UPDATE orders SET status = 'washing', bay_id = ?, started_at = ? WHERE id = ?",
    [bayId, now, orderId],
  )

  saveDbToDisk()

  await addLog({
    operator_role: 'staff',
    operator_name: 'system',
    action: 'call_next',
    target_bay_id: bayId,
    target_order_id: orderId,
    details: `叫号：分配${bayName}，订单#${orderId}`,
  })

  return { queueEntryId: qeId, bayId, bayName, orderId }
}

export async function leaveQueue(id: number) {
  const db = await getDb()

  const qe = queryOne('SELECT * FROM queue_entries WHERE id = ?', [id])
  if (!qe) {
    throw new Error('排队记录不存在')
  }

  if (qe.status !== 'waiting') {
    throw new Error('只能取消等待中的排队')
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const orderId = Number(qe.order_id)

  db.run(
    "UPDATE queue_entries SET status = 'cancelled', cancelled_at = ?, cancel_reason = '用户主动离队' WHERE id = ?",
    [now, id],
  )

  db.run(
    "UPDATE orders SET status = 'cancelled', cancelled_at = ? WHERE id = ?",
    [now, orderId],
  )

  db.run(
    "UPDATE queue_entries SET position = position - 1 WHERE status = 'waiting' AND position > ?",
    [Number(qe.position)],
  )

  saveDbToDisk()

  await addLog({
    operator_role: 'system',
    operator_name: 'system',
    action: 'leave_queue',
    target_order_id: orderId,
    details: `用户主动离队，排队#${id}`,
  })

  return { id, orderId, cancelledAt: now }
}
