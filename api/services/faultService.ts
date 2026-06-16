import { getDb, saveDbToDisk, queryAll, queryOne } from '../database.js'
import { addLog } from './operationLogService.js'
import { addTimelineEvent } from './timelineService.js'
import { calculateFaultRefund, FAULT_TRANSFER_STRATEGY } from '../config.js'

const DEFAULT_FAULT_LOSS: Record<string, number> = {
  equipment: 1500,
  power: 3000,
  water: 2000,
  other: 500,
}

const SEVERITY_MULTIPLIER: Record<string, number> = {
  minor: 0.5,
  major: 1.0,
  critical: 2.0,
}

export function estimateFaultLossCents(fault_type: string, severity: string, bayCurrentOrderId: number | null = null): number {
  let lossCents = (DEFAULT_FAULT_LOSS[fault_type] ?? 500) * (SEVERITY_MULTIPLIER[severity] ?? 1.0)
  if (bayCurrentOrderId) {
    lossCents += 500
  }
  return Math.round(lossCents)
}

export interface ReportFaultData {
  bay_id: number
  fault_type: string
  severity: string
  description?: string
  estimated_loss_cents?: number
  reported_by: string
}

export interface TransferDecision {
  transfer_type: 'requeue' | 'refund' | 'new_bay' | 'manual_confirm'
  refund_amount: number
  needs_confirmation: boolean
  reason: string
}

function decideTransferStrategy(
  severity: string,
  orderStatus: string,
  paymentStatus: string,
  baseAmount: number,
): TransferDecision {
  const severityUpper = severity.toUpperCase() as keyof typeof FAULT_TRANSFER_STRATEGY
  const strategy = FAULT_TRANSFER_STRATEGY[severityUpper] ?? 'auto_requeue'

  if (strategy === 'manual_confirmation_required') {
    return {
      transfer_type: 'manual_confirm',
      refund_amount: calculateFaultRefund(baseAmount, severity),
      needs_confirmation: true,
      reason: `严重故障(${severity})需要店员人工确认处理方式`,
    }
  }

  if (orderStatus === 'washing') {
    if (paymentStatus === 'paid') {
      const refundAmount = calculateFaultRefund(baseAmount, severity)
      return {
        transfer_type: strategy === 'auto_requeue_with_refund' ? 'refund' : 'requeue',
        refund_amount: refundAmount,
        needs_confirmation: false,
        reason: refundAmount > 0
          ? `洗车中故障，按政策退还${((refundAmount / baseAmount) * 100).toFixed(0)}%费用`
          : '洗车中故障，重新排入队列优先位置',
      }
    }
    return {
      transfer_type: 'requeue',
      refund_amount: 0,
      needs_confirmation: false,
      reason: '未支付订单，重新排入队列',
    }
  }

  if (paymentStatus === 'paid') {
    const refundAmount = calculateFaultRefund(baseAmount, severity)
    return {
      transfer_type: strategy === 'auto_requeue_with_refund' ? 'refund' : 'requeue',
      refund_amount: refundAmount,
      needs_confirmation: false,
      reason: refundAmount > 0
        ? `已付费未开洗，退还${((refundAmount / baseAmount) * 100).toFixed(0)}%费用`
        : '已付费未开洗，重新排入队列',
    }
  }

  return {
    transfer_type: 'requeue',
    refund_amount: 0,
    needs_confirmation: false,
    reason: '未付费订单，重新排入队列',
  }
}

export async function getFaults(status?: string) {
  if (status) {
    return queryAll('SELECT * FROM faults WHERE status = ? ORDER BY reported_at DESC', [status])
  }
  return queryAll('SELECT * FROM faults ORDER BY reported_at DESC')
}

export async function createTransfer(
  faultId: number,
  fromOrderId: number,
  fromBayId: number,
  decision: TransferDecision,
): Promise<number> {
  const db = await getDb()
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)

  const status = decision.needs_confirmation ? 'awaiting_confirmation' : 'pending'

  db.run(
    `INSERT INTO order_transfers (
      fault_id, from_order_id, from_bay_id, transfer_type,
      refund_amount, status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [faultId, fromOrderId, fromBayId, decision.transfer_type, decision.refund_amount, status, decision.reason],
  )

  const result = db.exec('SELECT last_insert_rowid() as id')
  return Number(result[0]?.values[0]?.[0])
}

export async function executeTransfer(transferId: number, operatorName: string) {
  const db = await getDb()
  const transfer = queryOne('SELECT * FROM order_transfers WHERE id = ?', [transferId])

  if (!transfer) {
    throw new Error('转移记录不存在')
  }

  if (transfer.status !== 'pending' && transfer.status !== 'awaiting_confirmation') {
    throw new Error(`转移状态为${transfer.status}，无法执行`)
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const fromOrderId = Number(transfer.from_order_id)
  const fromBayId = Number(transfer.from_bay_id)
  const faultId = Number(transfer.fault_id)
  const refundAmount = Number(transfer.refund_amount)
  const transferType = String(transfer.transfer_type)

  const order = queryOne('SELECT * FROM orders WHERE id = ?', [fromOrderId])
  if (!order) {
    throw new Error('原订单不存在')
  }

  if (transferType === 'refund') {
    if (order.payment_status === 'paid' && refundAmount > 0) {
      const newTotal = Math.max(0, Number(order.total_amount) - refundAmount)
      db.run(
        'UPDATE orders SET payment_status = \'partial_refund\', total_amount = ? WHERE id = ?',
        [newTotal, fromOrderId],
      )
      db.run(
        `INSERT INTO billings (order_id, billing_type, amount, description)
         VALUES (?, 'transfer_refund', ?, ?)`,
        [fromOrderId, -refundAmount, `故障转移退款¥${(refundAmount / 100).toFixed(2)}`],
      )
    }
    db.run(
      "UPDATE orders SET status = 'cancelled', cancelled_at = ? WHERE id = ?",
      [now, fromOrderId],
    )
    db.run(
      "UPDATE queue_entries SET status = 'cancelled', cancelled_at = ?, cancel_reason = '故障转移退款' WHERE order_id = ?",
      [now, fromOrderId],
    )
  } else if (transferType === 'requeue' || transferType === 'new_bay') {
    db.run(
      "UPDATE orders SET status = 'queued', bay_id = NULL WHERE id = ?",
      [fromOrderId],
    )
    db.run(
      "UPDATE queue_entries SET status = 'waiting', assigned_bay_id = NULL WHERE order_id = ? AND status IN ('called', 'serving')",
      [fromOrderId],
    )

    const waitingQeRows = queryAll(
      `SELECT id, order_id, position FROM queue_entries WHERE status = 'waiting' ORDER BY position ASC`,
    )
    const minPos = waitingQeRows.length > 0 ? Math.min(...waitingQeRows.map(r => Number(r.position))) : 1

    db.run(
      `UPDATE queue_entries SET position = ? WHERE order_id = ? AND status = 'waiting'`,
      [minPos, fromOrderId],
    )

    const allQeRows = queryAll(
      `SELECT id FROM queue_entries WHERE status = 'waiting' ORDER BY position ASC, id ASC`,
    )
    allQeRows.forEach((row, idx) => {
      db.run(`UPDATE queue_entries SET position = ? WHERE id = ?`, [idx + 1, Number(row.id)])
    })

    if (refundAmount > 0 && order.payment_status === 'paid') {
      const newTotal = Math.max(0, Number(order.total_amount) - refundAmount)
      db.run(
        'UPDATE orders SET payment_status = \'partial_refund\', total_amount = ? WHERE id = ?',
        [newTotal, fromOrderId],
      )
      db.run(
        `INSERT INTO billings (order_id, billing_type, amount, description)
         VALUES (?, 'transfer_refund', ?, ?)`,
        [fromOrderId, -refundAmount, `故障补偿退款¥${(refundAmount / 100).toFixed(2)}`],
      )
    }
  }

  db.run(
    "UPDATE order_transfers SET status = 'completed', confirmed_by = ?, confirmed_at = ? WHERE id = ?",
    [operatorName, now, transferId],
  )

  const bayRow = queryOne('SELECT * FROM bays WHERE id = ?', [fromBayId])
  if (bayRow && Number(bayRow.current_order_id) === fromOrderId) {
    db.run(
      "UPDATE bays SET current_order_id = NULL WHERE id = ?",
      [fromBayId],
    )
  }

  const actualLoss = refundAmount + estimateFaultLossCents('equipment', 'minor', fromOrderId)
  db.run(
    'UPDATE faults SET actual_loss_cents = actual_loss_cents + ? WHERE id = ?',
    [actualLoss, faultId],
  )

  saveDbToDisk()

  await addTimelineEvent({
    event_type: 'order_transfer',
    fault_id: faultId,
    transfer_id: transferId,
    order_id: fromOrderId,
    bay_id: fromBayId,
    operator_role: 'staff',
    operator_name: operatorName,
    details: `故障转移执行：${transferType}，退款¥${(refundAmount / 100).toFixed(2)}`,
    metadata: { transfer_type: transferType, refund_amount: refundAmount },
  })

  await addTimelineEvent({
    event_type: 'fault_transfer',
    fault_id: faultId,
    bay_id: fromBayId,
    operator_role: 'staff',
    operator_name: operatorName,
    details: `车位#${fromBayId}故障，订单#${fromOrderId}转移处理完成`,
  })

  await addLog({
    operator_role: 'staff',
    operator_name: operatorName,
    action: 'execute_fault_transfer',
    target_order_id: fromOrderId,
    target_bay_id: fromBayId,
    details: `执行故障转移#${transferId}（关联故障#${faultId}）：${transferType}，退款¥${(refundAmount / 100).toFixed(2)}`,
  })

  return { transferId, status: 'completed', transferType, refundAmount }
}

export async function confirmManualTransfer(
  transferId: number,
  decision: 'refund' | 'requeue',
  operatorName: string,
  customRefundAmount?: number,
) {
  const db = await getDb()
  const transfer = queryOne('SELECT * FROM order_transfers WHERE id = ?', [transferId])

  if (!transfer) {
    throw new Error('转移记录不存在')
  }

  if (transfer.status !== 'awaiting_confirmation') {
    throw new Error(`转移状态为${transfer.status}，无需人工确认`)
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const refundAmount = customRefundAmount ?? Number(transfer.refund_amount)

  db.run(
    `UPDATE order_transfers 
     SET transfer_type = ?, refund_amount = ?, status = 'pending', confirmed_by = ?, confirmed_at = ?
     WHERE id = ?`,
    [decision, refundAmount, operatorName, now, transferId],
  )

  saveDbToDisk()

  await addTimelineEvent({
    event_type: 'fault_manual_confirm',
    transfer_id: transferId,
    operator_role: 'staff',
    operator_name: operatorName,
    details: `人工确认故障转移：选择${decision}，退款¥${(refundAmount / 100).toFixed(2)}`,
    metadata: { decision, refund_amount: refundAmount },
  })

  return executeTransfer(transferId, operatorName)
}

export async function getPendingTransfers() {
  return queryAll(
    `SELECT ot.*, 
            f.severity as fault_severity, f.fault_type,
            o.plate_number, o.service_package, o.car_type, o.payment_status, o.total_amount,
            b.name as bay_name
     FROM order_transfers ot
     JOIN faults f ON ot.fault_id = f.id
     JOIN orders o ON ot.from_order_id = o.id
     JOIN bays b ON ot.from_bay_id = b.id
     WHERE ot.status IN ('pending', 'awaiting_confirmation')
     ORDER BY ot.created_at DESC`,
  )
}

export async function getTransfersByFault(faultId: number) {
  return queryAll(
    `SELECT ot.*, o.plate_number, b.name as bay_name
     FROM order_transfers ot
     JOIN orders o ON ot.from_order_id = o.id
     JOIN bays b ON ot.from_bay_id = b.id
     WHERE ot.fault_id = ?
     ORDER BY ot.created_at DESC`,
    [faultId],
  )
}

export async function reportFault(data: ReportFaultData & { operator_role?: string }) {
  const db = await getDb()

  const bay = queryOne('SELECT * FROM bays WHERE id = ?', [data.bay_id])
  if (!bay) {
    throw new Error('车位不存在')
  }

  if (bay.status === 'fault') {
    throw new Error('该车已处于故障状态')
  }

  const validFaultTypes = ['equipment', 'power', 'water', 'other']
  if (!validFaultTypes.includes(data.fault_type)) {
    throw new Error(`无效故障类型: ${data.fault_type}`)
  }

  const validSeverities = ['minor', 'major', 'critical']
  if (!validSeverities.includes(data.severity)) {
    throw new Error(`无效严重程度: ${data.severity}`)
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const currentOrderId = bay.current_order_id ? Number(bay.current_order_id) : null
  const estimatedLossCents = data.estimated_loss_cents ?? estimateFaultLossCents(data.fault_type, data.severity, currentOrderId)

  db.run(
    `INSERT INTO faults (
      bay_id, fault_type, severity, description, estimated_loss_cents, reported_at, reported_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.bay_id,
      data.fault_type,
      data.severity,
      data.description ?? null,
      estimatedLossCents,
      now,
      data.reported_by,
    ],
  )

  const faultResult = db.exec('SELECT last_insert_rowid() as id')
  const faultId = Number(faultResult[0]?.values[0]?.[0])

  db.run(
    "UPDATE bays SET status = 'fault', updated_at = ? WHERE id = ?",
    [now, data.bay_id],
  )

  const affectedOrderIds: number[] = []
  const transferIds: number[] = []

  if (currentOrderId) {
    affectedOrderIds.push(currentOrderId)
    const order = queryOne('SELECT * FROM orders WHERE id = ?', [currentOrderId])
    if (order) {
      const decision = decideTransferStrategy(
        data.severity,
        String(order.status),
        String(order.payment_status),
        Number(order.base_amount),
      )
      const transferId = await createTransfer(faultId, currentOrderId, data.bay_id, decision)
      transferIds.push(transferId)

      if (!decision.needs_confirmation) {
        await executeTransfer(transferId, data.reported_by)
      }
    }
  }

  const affectedQeRows = queryAll(
    `SELECT id, order_id FROM queue_entries WHERE assigned_bay_id = ? AND status IN ('called', 'serving')`,
    [data.bay_id],
  )
  for (const qeRow of affectedQeRows) {
    const qeOrderId = Number(qeRow.order_id)
    if (!affectedOrderIds.includes(qeOrderId)) {
      affectedOrderIds.push(qeOrderId)
      const order = queryOne('SELECT * FROM orders WHERE id = ?', [qeOrderId])
      if (order) {
        const decision = decideTransferStrategy(
          data.severity,
          String(order.status),
          String(order.payment_status),
          Number(order.base_amount),
        )
        const transferId = await createTransfer(faultId, qeOrderId, data.bay_id, decision)
        transferIds.push(transferId)

        if (!decision.needs_confirmation) {
          await executeTransfer(transferId, data.reported_by)
        }
      }
    }
  }

  saveDbToDisk()

  const operatorRole = (data.operator_role ?? 'maintenance') as 'staff' | 'maintenance' | 'system'
  await addTimelineEvent({
    event_type: 'fault_report',
    fault_id: faultId,
    bay_id: data.bay_id,
    operator_role: operatorRole,
    operator_name: data.reported_by,
    details: `报告车位#${data.bay_id}故障: ${data.fault_type}(${data.severity})${affectedOrderIds.length > 0 ? `，影响${affectedOrderIds.length}个订单` : ''}`,
    metadata: {
      fault_type: data.fault_type,
      severity: data.severity,
      estimated_loss: estimatedLossCents,
      affected_orders: affectedOrderIds,
    },
  })

  await addLog({
    operator_role: operatorRole,
    operator_name: data.reported_by,
    action: 'report_fault',
    target_bay_id: data.bay_id,
    details: `报告车位#${data.bay_id}故障: ${data.fault_type}(${data.severity})${affectedOrderIds.length > 0 ? `，影响${affectedOrderIds.length}个订单，已创建${transferIds.length}个转移任务` : ''}，预估损失¥${(estimatedLossCents / 100).toFixed(2)}`,
  })

  return {
    faultId,
    bayId: data.bay_id,
    reportedAt: now,
    affectedOrderCount: affectedOrderIds.length,
    estimatedLossCents,
    transferIds,
    awaitingConfirmation: transferIds.length > 0,
  }
}

export async function resolveFault(id: number, resolvedBy: string) {
  const db = await getDb()

  const fault = queryOne('SELECT * FROM faults WHERE id = ?', [id])
  if (!fault) {
    throw new Error('故障记录不存在')
  }

  if (fault.status === 'resolved') {
    throw new Error('故障已解决')
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const bayId = Number(fault.bay_id)

  db.run(
    "UPDATE faults SET status = 'resolved', resolved_at = ?, resolved_by = ? WHERE id = ?",
    [now, resolvedBy, id],
  )

  const otherActiveRow = queryOne(
    "SELECT COUNT(*) as cnt FROM faults WHERE bay_id = ? AND status = 'active' AND id != ?",
    [bayId, id],
  )
  const otherActive = Number(otherActiveRow?.cnt ?? 0)

  if (otherActive === 0) {
    db.run(
      "UPDATE bays SET status = 'idle', updated_at = ? WHERE id = ?",
      [now, bayId],
    )
  }

  saveDbToDisk()

  await addTimelineEvent({
    event_type: 'fault_resolve',
    fault_id: id,
    bay_id: bayId,
    operator_role: 'maintenance',
    operator_name: resolvedBy,
    details: `故障#${id}已解决，车位#${bayId}恢复`,
  })

  await addLog({
    operator_role: 'maintenance',
    operator_name: resolvedBy,
    action: 'resolve_fault',
    target_bay_id: bayId,
    details: `${resolvedBy}解决故障#${id}，车位#${bayId}恢复`,
  })

  return { faultId: id, bayId, resolvedAt: now }
}

export async function getFaultStats() {
  const db = await getDb()

  const totalResult = db.exec('SELECT COUNT(*) as cnt FROM faults')
  const total = Number(totalResult[0]?.values[0]?.[0] ?? 0)

  const activeResult = db.exec("SELECT COUNT(*) as cnt FROM faults WHERE status = 'active'")
  const active = Number(activeResult[0]?.values[0]?.[0] ?? 0)

  const resolvedResult = db.exec("SELECT COUNT(*) as cnt FROM faults WHERE status = 'resolved'")
  const resolved = Number(resolvedResult[0]?.values[0]?.[0] ?? 0)

  const byTypeResult = db.exec('SELECT fault_type, COUNT(*) as cnt FROM faults GROUP BY fault_type')
  const byType: Record<string, number> = {}
  if (byTypeResult[0]) {
    for (const row of byTypeResult[0].values) {
      byType[String(row[0])] = Number(row[1])
    }
  }

  const bySeverityResult = db.exec('SELECT severity, COUNT(*) as cnt FROM faults GROUP BY severity')
  const bySeverity: Record<string, number> = {}
  if (bySeverityResult[0]) {
    for (const row of bySeverityResult[0].values) {
      bySeverity[String(row[0])] = Number(row[1])
    }
  }

  const estimatedLossResult = db.exec('SELECT COALESCE(SUM(estimated_loss_cents), 0) as total_loss FROM faults')
  const totalEstimatedLossCents = Number(estimatedLossResult[0]?.values[0]?.[0] ?? 0)

  const actualLossResult = db.exec('SELECT COALESCE(SUM(actual_loss_cents), 0) as total_loss FROM faults')
  const totalActualLossCents = Number(actualLossResult[0]?.values[0]?.[0] ?? 0)

  const transferResult = db.exec('SELECT COUNT(*) as cnt FROM order_transfers')
  const transferCount = Number(transferResult[0]?.values[0]?.[0] ?? 0)

  const transferRefundResult = db.exec(
    "SELECT COALESCE(SUM(refund_amount), 0) as total FROM order_transfers WHERE status = 'completed'",
  )
  const totalTransferRefundCents = Number(transferRefundResult[0]?.values[0]?.[0] ?? 0)

  const avgResolveResult = db.exec(
    `SELECT AVG(
       (julianday(resolved_at) - julianday(reported_at)) * 24 * 60
     ) as avg_minutes FROM faults WHERE status = 'resolved' AND resolved_at IS NOT NULL`,
  )
  const avgResolveMinutes = Number(avgResolveResult[0]?.values[0]?.[0] ?? 0)

  return {
    total,
    active,
    resolved,
    byType,
    bySeverity,
    totalEstimatedLossCents,
    totalActualLossCents,
    totalTransferRefundCents,
    transferCount,
    avgResolveMinutes: Math.round(avgResolveMinutes),
  }
}
