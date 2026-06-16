import { getDb, queryAll, queryOne } from '../database.js'

export async function getRevenueStats() {
  const db = await getDb()

  const totalResult = db.exec("SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE payment_status = 'paid'")
  const totalRevenue = Number(totalResult[0]?.values[0]?.[0] ?? 0)

  const byPackageResult = db.exec(
    "SELECT service_package, COALESCE(SUM(total_amount), 0) as total FROM orders WHERE payment_status = 'paid' GROUP BY service_package",
  )
  const byPackage: Record<string, number> = {}
  if (byPackageResult[0]) {
    for (const row of byPackageResult[0].values) {
      byPackage[String(row[0])] = Number(row[1])
    }
  }

  const byPaymentResult = db.exec(
    "SELECT payment_method, COALESCE(SUM(total_amount), 0) as total FROM orders WHERE payment_status = 'paid' GROUP BY payment_method",
  )
  const byPaymentMethod: Record<string, number> = {}
  if (byPaymentResult[0]) {
    for (const row of byPaymentResult[0].values) {
      byPaymentMethod[String(row[0])] = Number(row[1])
    }
  }

  const byDate = queryAll(
    `SELECT DATE(created_at) as date, COALESCE(SUM(total_amount), 0) as total
     FROM orders WHERE payment_status = 'paid' GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 30`,
  )

  const baseResult = db.exec("SELECT COALESCE(SUM(base_amount), 0) as total FROM orders WHERE payment_status = 'paid'")
  const baseRevenue = Number(baseResult[0]?.values[0]?.[0] ?? 0)

  const overtimeResult = db.exec("SELECT COALESCE(SUM(overtime_amount), 0) as total FROM orders WHERE payment_status = 'paid'")
  const overtimeRevenue = Number(overtimeResult[0]?.values[0]?.[0] ?? 0)

  const refundResult = db.exec("SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM billings WHERE billing_type = 'refund'")
  const refundTotal = Number(refundResult[0]?.values[0]?.[0] ?? 0)

  return {
    totalRevenue,
    baseRevenue,
    overtimeRevenue,
    refundTotal,
    netRevenue: totalRevenue - refundTotal,
    byPackage,
    byPaymentMethod,
    byDate,
  }
}

export async function getOvertimeStats() {
  const db = await getDb()

  const countResult = db.exec("SELECT COUNT(*) as cnt FROM orders WHERE overtime_amount > 0")
  const overtimeCount = Number(countResult[0]?.values[0]?.[0] ?? 0)

  const totalOvertimeResult = db.exec("SELECT COALESCE(SUM(overtime_amount), 0) as total FROM orders")
  const totalOvertimeRevenue = Number(totalOvertimeResult[0]?.values[0]?.[0] ?? 0)

  const byBay = queryAll(
    `SELECT bay_id, COUNT(*) as cnt, COALESCE(SUM(overtime_amount), 0) as total
     FROM orders WHERE overtime_amount > 0 GROUP BY bay_id`,
  )

  const distribution = queryAll(
    `SELECT
      CASE
        WHEN overtime_amount BETWEEN 1 AND 5 THEN '1-5'
        WHEN overtime_amount BETWEEN 6 AND 15 THEN '6-15'
        WHEN overtime_amount BETWEEN 16 AND 30 THEN '16-30'
        ELSE '30+'
      END as range,
      COUNT(*) as cnt
     FROM orders WHERE overtime_amount > 0 GROUP BY range`,
  )

  return {
    overtimeCount,
    totalOvertimeRevenue,
    byBay,
    distribution,
  }
}

export async function getFaultLossStats() {
  const db = await getDb()

  const countResult = db.exec('SELECT COUNT(*) as cnt FROM faults')
  const faultCount = Number(countResult[0]?.values[0]?.[0] ?? 0)

  const activeResult = db.exec("SELECT COUNT(*) as cnt FROM faults WHERE status = 'active'")
  const activeCount = Number(activeResult[0]?.values[0]?.[0] ?? 0)

  const lossResult = db.exec('SELECT COALESCE(SUM(estimated_loss_cents), 0) as total FROM faults')
  const totalLossCents = Number(lossResult[0]?.values[0]?.[0] ?? 0)

  const avgDurationResult = db.exec(
    `SELECT AVG(
       (julianday(COALESCE(resolved_at, datetime('now','localtime'))) - julianday(reported_at)) * 24 * 60
     ) as avg_minutes FROM faults`,
  )
  const avgDurationMinutes = Math.round(Number(avgDurationResult[0]?.values[0]?.[0] ?? 0))

  const byBay = queryAll(
    `SELECT bay_id, COUNT(*) as cnt, COALESCE(SUM(estimated_loss_cents), 0) as total_loss
     FROM faults GROUP BY bay_id`,
  )

  const byType = queryAll(
    `SELECT fault_type, COUNT(*) as cnt, COALESCE(SUM(estimated_loss_cents), 0) as total_loss
     FROM faults GROUP BY fault_type`,
  )

  return {
    faultCount,
    activeCount,
    totalLossCents,
    avgDurationMinutes,
    byBay,
    byType,
  }
}

export async function getCancellationStats() {
  const db = await getDb()

  const countResult = db.exec("SELECT COUNT(*) as cnt FROM orders WHERE status = 'cancelled'")
  const cancelCount = Number(countResult[0]?.values[0]?.[0] ?? 0)

  const reasonsDistribution = queryAll(
    `SELECT cancel_reason, COUNT(*) as cnt FROM queue_entries
     WHERE status = 'cancelled' AND cancel_reason IS NOT NULL
     GROUP BY cancel_reason`,
  )

  const refundResult = db.exec(
    `SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM billings WHERE billing_type = 'refund'`,
  )
  const refundTotal = Number(refundResult[0]?.values[0]?.[0] ?? 0)

  const byPackage = queryAll(
    "SELECT service_package, COUNT(*) as cnt FROM orders WHERE status = 'cancelled' GROUP BY service_package",
  )

  const byDate = queryAll(
    `SELECT DATE(cancelled_at) as date, COUNT(*) as cnt
     FROM orders WHERE status = 'cancelled' GROUP BY DATE(cancelled_at) ORDER BY date DESC LIMIT 30`,
  )

  return {
    cancelCount,
    reasonsDistribution,
    refundTotal,
    byPackage,
    byDate,
  }
}

export async function getReservationStats() {
  const db = await getDb()

  const totalResult = db.exec('SELECT COUNT(*) as cnt FROM reservations')
  const totalReservations = Number(totalResult[0]?.values[0]?.[0] ?? 0)

  const reservedResult = db.exec("SELECT COUNT(*) as cnt FROM reservations WHERE status = 'reserved'")
  const reservedCount = Number(reservedResult[0]?.values[0]?.[0] ?? 0)

  const checkedInResult = db.exec("SELECT COUNT(*) as cnt FROM reservations WHERE status = 'checked_in'")
  const checkedInCount = Number(checkedInResult[0]?.values[0]?.[0] ?? 0)

  const noShowResult = db.exec("SELECT COUNT(*) as cnt FROM reservations WHERE status = 'no_show'")
  const noShowCount = Number(noShowResult[0]?.values[0]?.[0] ?? 0)

  const cancelledResult = db.exec("SELECT COUNT(*) as cnt FROM reservations WHERE status = 'cancelled'")
  const cancelledCount = Number(cancelledResult[0]?.values[0]?.[0] ?? 0)

  const expiredResult = db.exec("SELECT COUNT(*) as cnt FROM reservations WHERE status = 'expired'")
  const expiredCount = Number(expiredResult[0]?.values[0]?.[0] ?? 0)

  const noShowFeeResult = db.exec(
    "SELECT COALESCE(SUM(no_show_fee), 0) as total FROM reservations WHERE status = 'no_show'",
  )
  const totalNoShowFeeCents = Number(noShowFeeResult[0]?.values[0]?.[0] ?? 0)

  const vipSkipResult = db.exec("SELECT COUNT(*) as cnt FROM reservations WHERE skipped_line = 1")
  const vipSkipCount = Number(vipSkipResult[0]?.values[0]?.[0] ?? 0)

  const byDate = queryAll(
    `SELECT DATE(reserved_time) as date,
            COUNT(*) as total,
            SUM(CASE WHEN status = 'checked_in' THEN 1 ELSE 0 END) as checked_in,
            SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) as no_show,
            SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
            COALESCE(SUM(CASE WHEN status = 'no_show' THEN no_show_fee ELSE 0 END), 0) as no_show_fee
     FROM reservations
     GROUP BY DATE(reserved_time)
     ORDER BY date DESC LIMIT 30`,
  )

  const utilizationRate = totalReservations > 0
    ? Math.round(((checkedInCount + noShowCount) / totalReservations) * 100)
    : 0
  const noShowRate = (checkedInCount + noShowCount) > 0
    ? Math.round((noShowCount / (checkedInCount + noShowCount)) * 100)
    : 0

  return {
    totalReservations,
    reservedCount,
    checkedInCount,
    noShowCount,
    cancelledCount,
    expiredCount,
    vipSkipCount,
    totalNoShowFeeCents,
    utilizationRate,
    noShowRate,
    byDate,
  }
}

export async function getFaultTransferStats() {
  const db = await getDb()

  const totalTransfersResult = db.exec('SELECT COUNT(*) as cnt FROM order_transfers')
  const totalTransfers = Number(totalTransfersResult[0]?.values[0]?.[0] ?? 0)

  const completedResult = db.exec("SELECT COUNT(*) as cnt FROM order_transfers WHERE status = 'completed'")
  const completedTransfers = Number(completedResult[0]?.values[0]?.[0] ?? 0)

  const pendingResult = db.exec("SELECT COUNT(*) as cnt FROM order_transfers WHERE status = 'pending'")
  const pendingTransfers = Number(pendingResult[0]?.values[0]?.[0] ?? 0)

  const awaitingResult = db.exec("SELECT COUNT(*) as cnt FROM order_transfers WHERE status = 'awaiting_confirmation'")
  const awaitingTransfers = Number(awaitingResult[0]?.values[0]?.[0] ?? 0)

  const refundResult = db.exec(
    "SELECT COALESCE(SUM(refund_amount), 0) as total FROM order_transfers WHERE status = 'completed'",
  )
  const totalRefundCents = Number(refundResult[0]?.values[0]?.[0] ?? 0)

  const byTypeResult = db.exec(
    "SELECT transfer_type, COUNT(*) as cnt, COALESCE(SUM(refund_amount), 0) as total_refund FROM order_transfers GROUP BY transfer_type",
  )
  const byType: Record<string, { count: number; totalRefund: number }> = {}
  if (byTypeResult[0]) {
    for (const row of byTypeResult[0].values) {
      byType[String(row[0])] = {
        count: Number(row[1]),
        totalRefund: Number(row[2]),
      }
    }
  }

  const byFaultResult = queryAll(
    `SELECT f.id as fault_id, f.fault_type, f.severity,
            COUNT(ot.id) as transfer_count,
            COALESCE(SUM(ot.refund_amount), 0) as total_refund
     FROM faults f
     LEFT JOIN order_transfers ot ON ot.fault_id = f.id
     GROUP BY f.id
     ORDER BY transfer_count DESC LIMIT 20`,
  )

  const actualLossResult = db.exec('SELECT COALESCE(SUM(actual_loss_cents), 0) as total FROM faults')
  const totalActualLossCents = Number(actualLossResult[0]?.values[0]?.[0] ?? 0)

  const estimatedLossResult = db.exec('SELECT COALESCE(SUM(estimated_loss_cents), 0) as total FROM faults')
  const totalEstimatedLossCents = Number(estimatedLossResult[0]?.values[0]?.[0] ?? 0)

  return {
    totalTransfers,
    completedTransfers,
    pendingTransfers,
    awaitingTransfers,
    totalRefundCents,
    totalActualLossCents,
    totalEstimatedLossCents,
    lossGapCents: Math.max(0, totalActualLossCents - totalEstimatedLossCents),
    byType,
    byFault: byFaultResult,
  }
}

export async function getMonthlyCardStats() {
  const db = await getDb()

  const totalResult = db.exec('SELECT COUNT(*) as cnt FROM monthly_cards')
  const totalCards = Number(totalResult[0]?.values[0]?.[0] ?? 0)

  const activeResult = db.exec("SELECT COUNT(*) as cnt FROM monthly_cards WHERE status = 'active'")
  const activeCards = Number(activeResult[0]?.values[0]?.[0] ?? 0)

  const expiredResult = db.exec("SELECT COUNT(*) as cnt FROM monthly_cards WHERE status = 'expired'")
  const expiredCards = Number(expiredResult[0]?.values[0]?.[0] ?? 0)

  const frozenResult = db.exec("SELECT COUNT(*) as cnt FROM monthly_cards WHERE status = 'frozen'")
  const frozenCards = Number(frozenResult[0]?.values[0]?.[0] ?? 0)

  const byTypeResult = db.exec(
    "SELECT card_type, COUNT(*) as cnt, COALESCE(SUM(total_washes), 0) as total_washes, COALESCE(SUM(remaining_washes), 0) as remaining_washes, COALESCE(SUM(total_reservations), 0) as total_reservations, COALESCE(SUM(remaining_reservations), 0) as remaining_reservations FROM monthly_cards GROUP BY card_type",
  )
  const byType: Record<string, {
    count: number
    totalWashes: number
    remainingWashes: number
    totalReservations: number
    remainingReservations: number
  }> = {}
  if (byTypeResult[0]) {
    for (const row of byTypeResult[0].values) {
      byType[String(row[0])] = {
        count: Number(row[1]),
        totalWashes: Number(row[2]),
        remainingWashes: Number(row[3]),
        totalReservations: Number(row[4]),
        remainingReservations: Number(row[5]),
      }
    }
  }

  const usedWashesResult = db.exec(
    "SELECT COALESCE(SUM(total_washes - remaining_washes), 0) as total FROM monthly_cards",
  )
  const totalUsedWashes = Number(usedWashesResult[0]?.values[0]?.[0] ?? 0)

  const usedReservationsResult = db.exec(
    "SELECT COALESCE(SUM(total_reservations - remaining_reservations), 0) as total FROM monthly_cards",
  )
  const totalUsedReservations = Number(usedReservationsResult[0]?.values[0]?.[0] ?? 0)

  return {
    totalCards,
    activeCards,
    expiredCards,
    frozenCards,
    totalUsedWashes,
    totalUsedReservations,
    byType,
  }
}

export async function getOverview() {
  const db = await getDb()

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayStr = todayStart.toISOString().replace('T', ' ').slice(0, 19)

  const totalOrdersResult = db.exec('SELECT COUNT(*) as cnt FROM orders')
  const totalOrders = Number(totalOrdersResult[0]?.values[0]?.[0] ?? 0)

  const queuedResult = db.exec("SELECT COUNT(*) as cnt FROM orders WHERE status = 'queued'")
  const queuedOrders = Number(queuedResult[0]?.values[0]?.[0] ?? 0)

  const washingResult = db.exec("SELECT COUNT(*) as cnt FROM orders WHERE status = 'washing'")
  const washingOrders = Number(washingResult[0]?.values[0]?.[0] ?? 0)

  const completedResult = db.exec("SELECT COUNT(*) as cnt FROM orders WHERE status = 'completed'")
  const completedOrders = Number(completedResult[0]?.values[0]?.[0] ?? 0)

  const cancelledResult = db.exec("SELECT COUNT(*) as cnt FROM orders WHERE status = 'cancelled'")
  const cancelledOrders = Number(cancelledResult[0]?.values[0]?.[0] ?? 0)

  const transferredResult = db.exec("SELECT COUNT(*) as cnt FROM orders WHERE status = 'transferred'")
  const transferredOrders = Number(transferredResult[0]?.values[0]?.[0] ?? 0)

  const idleBayResult = db.exec("SELECT COUNT(*) as cnt FROM bays WHERE status = 'idle'")
  const idleBays = Number(idleBayResult[0]?.values[0]?.[0] ?? 0)

  const occupiedBayResult = db.exec("SELECT COUNT(*) as cnt FROM bays WHERE status IN ('occupied', 'overtime')")
  const occupiedBays = Number(occupiedBayResult[0]?.values[0]?.[0] ?? 0)

  const faultBayResult = db.exec("SELECT COUNT(*) as cnt FROM bays WHERE status = 'fault'")
  const faultBays = Number(faultBayResult[0]?.values[0]?.[0] ?? 0)

  const waitingResult = db.exec("SELECT COUNT(*) as cnt FROM queue_entries WHERE status = 'waiting'")
  const waitingCount = Number(waitingResult[0]?.values[0]?.[0] ?? 0)

  const revenueResult = db.exec("SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE payment_status = 'paid'")
  const totalRevenue = Number(revenueResult[0]?.values[0]?.[0] ?? 0)

  const activeFaultResult = db.exec("SELECT COUNT(*) as cnt FROM faults WHERE status = 'active'")
  const activeFaults = Number(activeFaultResult[0]?.values[0]?.[0] ?? 0)

  const todayOrdersRow = queryOne(
    'SELECT COUNT(*) as cnt FROM orders WHERE created_at >= ?',
    [todayStr],
  )
  const todayOrders = Number(todayOrdersRow?.cnt ?? 0)

  const todayRevenueRow = queryOne(
    "SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE payment_status = 'paid' AND created_at >= ?",
    [todayStr],
  )
  const todayRevenue = Number(todayRevenueRow?.total ?? 0)

  const activeReservationsRow = queryOne(
    "SELECT COUNT(*) as cnt FROM reservations WHERE status = 'reserved'",
  )
  const activeReservations = Number(activeReservationsRow?.cnt ?? 0)

  const pendingTransfersRow = queryOne(
    "SELECT COUNT(*) as cnt FROM order_transfers WHERE status IN ('pending', 'awaiting_confirmation')",
  )
  const pendingTransfers = Number(pendingTransfersRow?.cnt ?? 0)

  const activeMonthlyCardsRow = queryOne(
    "SELECT COUNT(*) as cnt FROM monthly_cards WHERE status = 'active'",
  )
  const activeMonthlyCards = Number(activeMonthlyCardsRow?.cnt ?? 0)

  return {
    orders: {
      total: totalOrders,
      queued: queuedOrders,
      washing: washingOrders,
      completed: completedOrders,
      cancelled: cancelledOrders,
      transferred: transferredOrders,
    },
    bays: { idle: idleBays, occupied: occupiedBays, fault: faultBays, total: idleBays + occupiedBays + faultBays },
    queue: { waiting: waitingCount },
    revenue: { total: totalRevenue, today: todayRevenue },
    faults: { active: activeFaults },
    today: { orders: todayOrders, revenue: todayRevenue },
    reservations: { active: activeReservations },
    transfers: { pending: pendingTransfers },
    monthlyCards: { active: activeMonthlyCards },
  }
}
