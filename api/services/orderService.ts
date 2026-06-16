import { getDb, saveDbToDisk, queryAll, queryOne } from '../database.js'
import { calculateBaseAmount, PACKAGE_PRICES, CAR_TYPE_SURCHARGE } from '../config.js'
import { addLog } from './operationLogService.js'

export async function getOrders(status?: string) {
  if (status) {
    return queryAll('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC', [status])
  }
  return queryAll('SELECT * FROM orders ORDER BY created_at DESC')
}

export async function getOrder(id: number) {
  const order = queryOne('SELECT * FROM orders WHERE id = ?', [id])
  if (!order) {
    throw new Error('订单不存在')
  }

  const billings = queryAll('SELECT * FROM billings WHERE order_id = ? ORDER BY created_at ASC', [id])

  return { ...order, billings }
}

export async function changePackage(orderId: number, newPackage: string, operatorName: string) {
  const db = await getDb()

  const order = queryOne('SELECT * FROM orders WHERE id = ?', [orderId])
  if (!order) {
    throw new Error('订单不存在')
  }

  if (order.status === 'cancelled') {
    throw new Error('已取消订单无法修改套餐')
  }

  if (order.status === 'completed') {
    throw new Error('已完成订单无法修改套餐')
  }

  if (order.status === 'washing') {
    throw new Error('洗车中的订单无法修改套餐')
  }

  const validPackages = Object.keys(PACKAGE_PRICES)
  if (!validPackages.includes(newPackage)) {
    throw new Error(`无效套餐类型: ${newPackage}`)
  }

  const oldPackage = String(order.service_package)
  if (oldPackage === newPackage) {
    throw new Error('新套餐与当前套餐相同')
  }

  if (order.payment_status === 'paid' && String(order.payment_method) !== 'member') {
    const oldBase = Number(order.base_amount)
    const newBase = calculateBaseAmount(String(order.car_type), newPackage)
    if (newBase > oldBase) {
      throw new Error('已支付订单不能升级套餐，请先退款后重新下单')
    }
  }

  const oldBase = Number(order.base_amount)
  const newBase = calculateBaseAmount(String(order.car_type), newPackage)
  const diff = newBase - oldBase
  const newTotal = Number(order.overtime_amount) + newBase

  db.run(
    'UPDATE orders SET service_package = ?, base_amount = ?, total_amount = ? WHERE id = ?',
    [newPackage, newBase, newTotal, orderId],
  )

  const billingDesc = diff > 0
    ? `套餐升级:${oldPackage}→${newPackage}，补差价¥${(diff / 100).toFixed(2)}`
    : diff < 0
      ? `套餐降级:${oldPackage}→${newPackage}，退还差价¥${(Math.abs(diff) / 100).toFixed(2)}`
      : `套餐变更:${oldPackage}→${newPackage}`
  db.run(
    `INSERT INTO billings (order_id, billing_type, amount, description)
     VALUES (?, 'base', ?, ?)`,
    [orderId, diff, billingDesc],
  )

  if (diff < 0 && order.payment_status === 'paid') {
    db.run(
      `INSERT INTO billings (order_id, billing_type, amount, description)
       VALUES (?, 'refund', ?, ?)`,
      [orderId, diff, `套餐降级自动退还差价¥${(Math.abs(diff) / 100).toFixed(2)}`],
    )
  }

  db.run(
    "UPDATE queue_entries SET service_package = ? WHERE order_id = ? AND status IN ('waiting', 'called')",
    [newPackage, orderId],
  )

  saveDbToDisk()

  await addLog({
    operator_role: 'staff',
    operator_name: operatorName,
    action: 'change_package',
    target_order_id: orderId,
    details: `${operatorName}将订单#${orderId}套餐从${oldPackage}改为${newPackage}${diff !== 0 ? `，差价${diff > 0 ? '+' : ''}¥${(diff / 100).toFixed(2)}` : ''}`,
  })

  return { orderId, oldPackage, newPackage, diffCents: diff, newBaseCents: newBase, newTotalCents: newTotal }
}

export async function cancelOrder(orderId: number, reason: string, operatorName: string) {
  const db = await getDb()

  const order = queryOne('SELECT * FROM orders WHERE id = ?', [orderId])
  if (!order) {
    throw new Error('订单不存在')
  }

  if (order.status === 'washing') {
    throw new Error('洗车中的订单不能取消，请先强制完成')
  }

  if (order.status === 'cancelled') {
    throw new Error('订单已取消')
  }

  if (order.status === 'completed') {
    throw new Error('已完成订单不能取消')
  }

  if (!reason || reason.trim().length === 0) {
    throw new Error('请填写取消原因')
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)

  db.run(
    "UPDATE orders SET status = 'cancelled', cancelled_at = ?, cancel_reason = ? WHERE id = ?",
    [now, reason, orderId],
  )

  db.run(
    "UPDATE queue_entries SET status = 'cancelled', cancelled_at = ?, cancel_reason = ? WHERE order_id = ? AND status IN ('waiting', 'called')",
    [now, reason, orderId],
  )

  const waitingQeRows = queryAll(
    `SELECT id FROM queue_entries WHERE status = 'waiting' ORDER BY position ASC, id ASC`,
  )
  waitingQeRows.forEach((row, idx) => {
    db.run(`UPDATE queue_entries SET position = ? WHERE id = ?`, [idx + 1, Number(row.id)])
  })

  let refundCents = 0
  if (order.payment_status === 'paid') {
    refundCents = Number(order.total_amount)
    db.run(
      "UPDATE orders SET payment_status = 'refunded' WHERE id = ?",
      [orderId],
    )
    db.run(
      `INSERT INTO billings (order_id, billing_type, amount, description)
       VALUES (?, 'refund', ?, ?)`,
      [orderId, -refundCents, `取消订单退款¥${(refundCents / 100).toFixed(2)}，原因: ${reason}`],
    )
  }

  if (order.bay_id) {
    db.run(
      "UPDATE bays SET status = 'idle', current_order_id = NULL, updated_at = ? WHERE id = ?",
      [now, Number(order.bay_id)],
    )
  }

  saveDbToDisk()

  await addLog({
    operator_role: 'staff',
    operator_name: operatorName,
    action: 'cancel_order',
    target_order_id: orderId,
    target_bay_id: order.bay_id ? Number(order.bay_id) : null,
    details: `${operatorName}取消订单#${orderId}，原因: ${reason}${refundCents > 0 ? `，退款¥${(refundCents / 100).toFixed(2)}` : ''}`,
  })

  return { orderId, cancelledAt: now, reason, refundCents }
}

export async function payOrder(orderId: number) {
  const db = await getDb()

  const order = queryOne('SELECT * FROM orders WHERE id = ?', [orderId])
  if (!order) {
    throw new Error('订单不存在')
  }

  if (order.payment_status === 'paid') {
    throw new Error('订单已支付')
  }

  if (order.payment_status === 'refunded') {
    throw new Error('订单已退款')
  }

  db.run("UPDATE orders SET payment_status = 'paid' WHERE id = ?", [orderId])
  saveDbToDisk()

  await addLog({
    operator_role: 'staff',
    operator_name: 'system',
    action: 'pay_order',
    target_order_id: orderId,
    details: `订单#${orderId}支付成功，金额${order.total_amount}元`,
  })

  return { orderId, paymentStatus: 'paid' }
}

export async function startWash(orderId: number, operatorName: string = 'system') {
  const db = await getDb()

  const order = queryOne('SELECT * FROM orders WHERE id = ?', [orderId])
  if (!order) {
    throw new Error('订单不存在')
  }

  if (order.payment_status === 'unpaid') {
    throw new Error('未支付订单不能开始洗车，请先完成支付')
  }

  if (order.payment_status === 'refunded') {
    throw new Error('该订单已退款，不能开始洗车')
  }

  if (order.status === 'washing') {
    throw new Error('订单已在洗车中')
  }

  if (order.status === 'completed') {
    throw new Error('订单已完成，无法开始洗车')
  }

  if (order.status === 'cancelled') {
    throw new Error('订单已取消，无法开始洗车')
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)

  let bayId: number | null = null

  const qeRow = queryOne(
    "SELECT assigned_bay_id FROM queue_entries WHERE order_id = ? AND status = 'called' AND assigned_bay_id IS NOT NULL",
    [orderId],
  )
  if (qeRow?.assigned_bay_id) {
    bayId = Number(qeRow.assigned_bay_id)
    const bay = queryOne("SELECT * FROM bays WHERE id = ?", [bayId])
    if (!bay || bay.status !== 'idle') {
      bayId = null
    }
  }

  if (!bayId) {
    const bayResult = db.exec("SELECT id FROM bays WHERE status = 'idle' ORDER BY id ASC LIMIT 1")
    if (!bayResult[0] || bayResult[0].values.length === 0) {
      throw new Error('没有空闲车位可用，请稍后再试')
    }
    bayId = Number(bayResult[0].values[0][0])
  }

  db.run(
    "UPDATE orders SET status = 'washing', bay_id = ?, started_at = ? WHERE id = ?",
    [bayId, now, orderId],
  )

  db.run(
    "UPDATE bays SET status = 'occupied', current_order_id = ?, updated_at = ? WHERE id = ?",
    [orderId, now, bayId],
  )

  db.run(
    "UPDATE queue_entries SET status = 'serving', assigned_bay_id = ? WHERE order_id = ? AND status IN ('waiting', 'called')",
    [bayId, orderId],
  )

  saveDbToDisk()

  await addLog({
    operator_role: 'staff',
    operator_name: operatorName,
    action: 'start_wash',
    target_bay_id: bayId,
    target_order_id: orderId,
    details: `${operatorName}启动订单#${orderId}洗车，分配车位#${bayId}`,
  })

  return { orderId, bayId, startedAt: now }
}

export async function overtimeCharge(orderId: number, amount: number, operatorName: string) {
  const db = await getDb()

  const order = queryOne('SELECT * FROM orders WHERE id = ?', [orderId])
  if (!order) {
    throw new Error('订单不存在')
  }

  if (order.status !== 'washing') {
    throw new Error('只能对洗车中的订单收取超时费')
  }

  const newOvertimeAmount = Number(order.overtime_amount) + amount
  const newTotalAmount = Number(order.base_amount) + newOvertimeAmount

  db.run(
    'UPDATE orders SET overtime_amount = ?, total_amount = ? WHERE id = ?',
    [newOvertimeAmount, newTotalAmount, orderId],
  )

  db.run(
    `INSERT INTO billings (order_id, billing_type, amount, description)
     VALUES (?, 'overtime', ?, ?)`,
    [orderId, amount, `超时加收${amount}元`],
  )

  if (order.bay_id) {
    db.run(
      "UPDATE bays SET status = 'overtime', updated_at = ? WHERE id = ? AND current_order_id = ?",
      [new Date().toISOString().replace('T', ' ').slice(0, 19), Number(order.bay_id), orderId],
    )
  }

  saveDbToDisk()

  await addLog({
    operator_role: 'staff',
    operator_name: operatorName,
    action: 'overtime_charge',
    target_order_id: orderId,
    target_bay_id: order.bay_id ? Number(order.bay_id) : null,
    details: `${operatorName}对订单#${orderId}收取超时费${amount}元`,
  })

  return { orderId, overtimeAmount: newOvertimeAmount, totalAmount: newTotalAmount, charge: amount }
}
