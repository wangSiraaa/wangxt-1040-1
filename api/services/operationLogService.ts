import { getDb, saveDbToDisk, queryAll } from '../database.js'

export interface AddLogData {
  operator_role: 'staff' | 'maintenance' | 'system'
  operator_name: string
  action: string
  target_bay_id?: number | null
  target_order_id?: number | null
  details?: string | null
}

export async function addLog(data: AddLogData) {
  const db = await getDb()
  db.run(
    `INSERT INTO operation_logs (operator_role, operator_name, action, target_bay_id, target_order_id, details)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.operator_role,
      data.operator_name,
      data.action,
      data.target_bay_id ?? null,
      data.target_order_id ?? null,
      data.details ?? null,
    ],
  )
  saveDbToDisk()
}

export async function getLogs(limit = 50, offset = 0) {
  return queryAll('SELECT * FROM operation_logs ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset])
}
