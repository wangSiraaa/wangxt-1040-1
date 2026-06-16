import { getDb, saveDbToDisk, queryAll, queryOne } from '../database.js'
import { addLog } from './operationLogService.js'

export async function getBays() {
  return queryAll('SELECT * FROM bays ORDER BY id ASC')
}

export async function updateBayStatus(id: number, status: string) {
  const db = await getDb()

  const bay = queryOne('SELECT * FROM bays WHERE id = ?', [id])
  if (!bay) {
    throw new Error('车位不存在')
  }

  const validStatuses = ['idle', 'occupied', 'fault', 'overtime']
  if (!validStatuses.includes(status)) {
    throw new Error(`无效状态: ${status}`)
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
  db.run('UPDATE bays SET status = ?, updated_at = ? WHERE id = ?', [status, now, id])
  saveDbToDisk()

  await addLog({
    operator_role: 'staff',
    operator_name: 'system',
    action: 'update_bay_status',
    target_bay_id: id,
    details: `车位#${id}状态变更为${status}`,
  })

  return { id, status, updatedAt: now }
}

export async function releaseBay(id: number, operatorName: string) {
  const db = await getDb()

  const bay = queryOne('SELECT * FROM bays WHERE id = ?', [id])
  if (!bay) {
    throw new Error('车位不存在')
  }

  if (bay.status !== 'occupied' && bay.status !== 'overtime') {
    throw new Error('只能释放占用或超时的车位')
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const currentOrderId = bay.current_order_id ? Number(bay.current_order_id) : null

  if (currentOrderId) {
    const qeRow = queryOne('SELECT id FROM queue_entries WHERE order_id = ? AND status IN (?, ?)', [currentOrderId, 'called', 'serving'])
    if (qeRow) {
      db.run("UPDATE queue_entries SET status = 'completed' WHERE order_id = ? AND status IN ('called', 'serving')", [currentOrderId])
    }
    db.run("UPDATE orders SET status = 'completed', completed_at = ? WHERE id = ?", [now, currentOrderId])
  }

  db.run("UPDATE bays SET status = 'idle', current_order_id = NULL, updated_at = ? WHERE id = ?", [now, id])
  saveDbToDisk()

  await addLog({
    operator_role: 'staff',
    operator_name: operatorName,
    action: 'release_bay',
    target_bay_id: id,
    target_order_id: currentOrderId,
    details: `${operatorName}强制释放车位#${id}`,
  })

  return { id, releasedAt: now, releasedOrderId: currentOrderId }
}

export async function forceComplete(id: number, operatorName: string) {
  const db = await getDb()

  const bay = queryOne('SELECT * FROM bays WHERE id = ?', [id])
  if (!bay) {
    throw new Error('车位不存在')
  }

  if (bay.status !== 'occupied' && bay.status !== 'overtime') {
    throw new Error('该车位没有正在进行的洗车任务')
  }

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const currentOrderId = bay.current_order_id ? Number(bay.current_order_id) : null

  if (currentOrderId) {
    const qeRow = queryOne("SELECT id FROM queue_entries WHERE order_id = ? AND status IN ('called', 'serving')", [currentOrderId])
    if (qeRow) {
      db.run("UPDATE queue_entries SET status = 'completed' WHERE order_id = ?", [currentOrderId])
    }
    db.run("UPDATE orders SET status = 'completed', completed_at = ? WHERE id = ?", [now, currentOrderId])
  }

  db.run("UPDATE bays SET status = 'idle', current_order_id = NULL, updated_at = ? WHERE id = ?", [now, id])
  saveDbToDisk()

  await addLog({
    operator_role: 'staff',
    operator_name: operatorName,
    action: 'force_complete',
    target_bay_id: id,
    target_order_id: currentOrderId,
    details: `${operatorName}强制完成车位#${id}的洗车`,
  })

  return { id, completedAt: now, completedOrderId: currentOrderId }
}
