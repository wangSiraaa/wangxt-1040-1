import { getDb, saveDbToDisk, queryAll, queryOne } from '../database.js'
import { MONTHLY_CARD_CONFIG, getMonthlyCardBenefits } from '../config.js'
import { addLog } from './operationLogService.js'
import { addTimelineEvent } from './timelineService.js'

export interface CreateMonthlyCardData {
  plate_number: string
  card_type: string
  valid_days?: number
}

export async function getMonthlyCard(plateNumber: string) {
  return queryOne('SELECT * FROM monthly_cards WHERE plate_number = ?', [plateNumber])
}

export async function getMonthlyCardById(id: number) {
  return queryOne('SELECT * FROM monthly_cards WHERE id = ?', [id])
}

export async function createMonthlyCard(data: CreateMonthlyCardData, operatorName: string = 'system') {
  const db = await getDb()

  const existing = queryOne('SELECT * FROM monthly_cards WHERE plate_number = ? AND status = ?', [data.plate_number, 'active'])
  if (existing) {
    throw new Error(`车牌${data.plate_number}已有有效月卡`)
  }

  const benefits = getMonthlyCardBenefits(data.card_type)
  const validDays = data.valid_days ?? 30
  const validFrom = new Date()
  const validUntil = new Date(validFrom.getTime() + validDays * 24 * 60 * 60 * 1000)
  const now = validFrom.toISOString().replace('T', ' ').slice(0, 19)

  db.run(
    `INSERT INTO monthly_cards (
      plate_number, card_type, total_washes, remaining_washes,
      total_reservations, remaining_reservations, status, valid_from, valid_until
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    [
      data.plate_number,
      data.card_type,
      benefits.totalWashes,
      benefits.totalWashes,
      benefits.totalReservations,
      benefits.totalReservations,
      validFrom.toISOString().replace('T', ' ').slice(0, 19),
      validUntil.toISOString().replace('T', ' ').slice(0, 19),
    ],
  )

  const result = db.exec('SELECT last_insert_rowid() as id')
  const cardId = Number(result[0]?.values[0]?.[0])

  saveDbToDisk()

  await addLog({
    operator_role: 'staff',
    operator_name: operatorName,
    action: 'create_monthly_card',
    details: `为车牌${data.plate_number}创建${data.card_type}月卡，有效期${validDays}天`,
  })

  return {
    id: cardId,
    plate_number: data.plate_number,
    card_type: data.card_type,
    ...benefits,
    valid_from: now,
    valid_until: validUntil.toISOString().replace('T', ' ').slice(0, 19),
  }
}

export async function useWash(cardId: number, operatorName: string = 'system') {
  const db = await getDb()
  const card = queryOne('SELECT * FROM monthly_cards WHERE id = ?', [cardId])

  if (!card) throw new Error('月卡不存在')
  if (card.status !== 'active') throw new Error('月卡状态无效')
  if (Number(card.remaining_washes) <= 0) throw new Error('月卡洗车次数已用完')

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)

  db.run(
    'UPDATE monthly_cards SET remaining_washes = remaining_washes - 1, updated_at = ? WHERE id = ?',
    [now, cardId],
  )

  saveDbToDisk()

  await addLog({
    operator_role: 'system',
    operator_name: operatorName,
    action: 'use_monthly_wash',
    details: `月卡#${cardId}使用1次洗车，剩余${Number(card.remaining_washes) - 1}次`,
  })

  return { cardId, remaining_washes: Number(card.remaining_washes) - 1 }
}

export async function useReservation(cardId: number, operatorName: string = 'system') {
  const db = await getDb()
  const card = queryOne('SELECT * FROM monthly_cards WHERE id = ?', [cardId])

  if (!card) throw new Error('月卡不存在')
  if (card.status !== 'active') throw new Error('月卡状态无效')
  if (Number(card.remaining_reservations) <= 0) throw new Error('月卡预约次数已用完')

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)

  db.run(
    'UPDATE monthly_cards SET remaining_reservations = remaining_reservations - 1, updated_at = ? WHERE id = ?',
    [now, cardId],
  )

  saveDbToDisk()

  return { cardId, remaining_reservations: Number(card.remaining_reservations) - 1 }
}

export async function refundWash(cardId: number, operatorName: string = 'system') {
  const db = await getDb()
  const card = queryOne('SELECT * FROM monthly_cards WHERE id = ?', [cardId])

  if (!card) throw new Error('月卡不存在')
  if (card.status !== 'active') throw new Error('月卡状态无效')

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const totalWashes = Number(card.total_washes)
  const currentRemaining = Number(card.remaining_washes)
  const newRemaining = Math.min(currentRemaining + 1, totalWashes)

  db.run(
    'UPDATE monthly_cards SET remaining_washes = ?, updated_at = ? WHERE id = ?',
    [newRemaining, now, cardId],
  )

  saveDbToDisk()

  return { cardId, remaining_washes: newRemaining }
}

export async function checkMonthlyCardEligibility(plateNumber: string): Promise<{
  eligible: boolean
  card: Record<string, unknown> | null
  reasons: string[]
}> {
  const card = await getMonthlyCard(plateNumber)
  const reasons: string[] = []

  if (!card) {
    return { eligible: false, card: null, reasons: ['未找到该车的月卡'] }
  }

  if (card.status !== 'active') {
    reasons.push(`月卡状态为${card.status}，不可用`)
  }

  const now = new Date()
  const validUntil = new Date(String(card.valid_until))
  if (now > validUntil) {
    reasons.push('月卡已过期')
  }

  if (Number(card.remaining_washes) <= 0) {
    reasons.push('月卡洗车次数已用完')
  }

  return {
    eligible: reasons.length === 0,
    card,
    reasons,
  }
}

export async function checkAndExpireMonthlyCards() {
  const db = await getDb()
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)

  const expiredCards = queryAll(
    "SELECT * FROM monthly_cards WHERE status = 'active' AND valid_until < ?",
    [now],
  )

  let expiredCount = 0
  for (const card of expiredCards) {
    db.run("UPDATE monthly_cards SET status = 'expired', updated_at = ? WHERE id = ?", [now, Number(card.id)])
    expiredCount++
  }

  if (expiredCount > 0) {
    saveDbToDisk()
    console.log(`[MonthlyCard] Auto-expired ${expiredCount} monthly card(s)`)
  }

  return { expiredCount }
}

export async function listMonthlyCards(status?: string) {
  if (status) {
    return queryAll('SELECT * FROM monthly_cards WHERE status = ? ORDER BY created_at DESC', [status])
  }
  return queryAll('SELECT * FROM monthly_cards ORDER BY created_at DESC')
}
