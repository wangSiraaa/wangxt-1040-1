import { getDb, saveDbToDisk, queryAll, queryOne } from '../database.js'
import { addLog } from './operationLogService.js'

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

export async function getFaults(status?: string) {
  if (status) {
    return queryAll('SELECT * FROM faults WHERE status = ? ORDER BY reported_at DESC', [status])
  }
  return queryAll('SELECT * FROM faults ORDER BY reported_at DESC')
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
    `INSERT INTO faults (bay_id, fault_type, severity, description, estimated_loss_cents, reported_at, reported_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
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

  if (currentOrderId) {
    affectedOrderIds.push(currentOrderId)
    db.run("UPDATE orders SET status = 'queued', bay_id = NULL WHERE id = ?", [currentOrderId])
    db.run(
      "UPDATE queue_entries SET status = 'waiting', assigned_bay_id = NULL WHERE order_id = ? AND status IN ('called', 'serving')",
      [currentOrderId],
    )
  }

  const affectedQeRows = queryAll(
    `SELECT id, order_id FROM queue_entries WHERE assigned_bay_id = ? AND status IN ('called', 'serving')`,
    [data.bay_id],
  )
  for (const qeRow of affectedQeRows) {
    const qeOrderId = Number(qeRow.order_id)
    if (!affectedOrderIds.includes(qeOrderId)) {
      affectedOrderIds.push(qeOrderId)
    }
    db.run("UPDATE orders SET status = 'queued', bay_id = NULL WHERE id = ?", [qeOrderId])
    db.run(
      "UPDATE queue_entries SET status = 'waiting', assigned_bay_id = NULL WHERE order_id = ?",
      [qeOrderId],
    )
  }

  if (affectedOrderIds.length > 0) {
    const waitingQeRows = queryAll(
      `SELECT id, order_id, position FROM queue_entries WHERE status = 'waiting' ORDER BY position ASC`,
    )
    const minPos = Math.min(...waitingQeRows.map(r => Number(r.position)), Number.MAX_SAFE_INTEGER)
    let priorityPos = minPos
    for (const oid of affectedOrderIds) {
      db.run(
        `UPDATE queue_entries SET position = ? WHERE order_id = ? AND status = 'waiting'`,
        [priorityPos, oid],
      )
      priorityPos++
    }
    const allQeRows = queryAll(
      `SELECT id, order_id FROM queue_entries WHERE status = 'waiting' ORDER BY position ASC, id ASC`,
    )
    allQeRows.forEach((row, idx) => {
      db.run(`UPDATE queue_entries SET position = ? WHERE id = ?`, [idx + 1, Number(row.id)])
    })
  }

  saveDbToDisk()

  const operatorRole = (data.operator_role ?? 'maintenance') as 'staff' | 'maintenance' | 'system'
  await addLog({
    operator_role: operatorRole,
    operator_name: data.reported_by,
    action: 'report_fault',
    target_bay_id: data.bay_id,
    details: `报告车位#${data.bay_id}故障: ${data.fault_type}(${data.severity})${affectedOrderIds.length > 0 ? `，影响${affectedOrderIds.length}个订单，已重新排入队列优先位置` : ''}，预估损失¥${(estimatedLossCents / 100).toFixed(2)}`,
  })

  return { faultId, bayId: data.bay_id, reportedAt: now, affectedOrderCount: affectedOrderIds.length, estimatedLossCents }
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

  const lossResult = db.exec('SELECT COALESCE(SUM(estimated_loss_cents), 0) as total_loss FROM faults')
  const totalLossCents = Number(lossResult[0]?.values[0]?.[0] ?? 0)

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
    totalLossCents,
    avgResolveMinutes: Math.round(avgResolveMinutes),
  }
}
