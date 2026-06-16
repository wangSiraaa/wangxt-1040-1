export const PACKAGE_PRICES: Record<string, number> = {
  standard: 25,
  premium: 45,
  interior: 55,
  full: 78,
}

export const CAR_TYPE_SURCHARGE: Record<string, number> = {
  sedan: 0,
  suv: 10,
  mpv: 15,
  van: 20,
}

export const OVERTIME_RATE_PER_INTERVAL = 5
export const OVERTIME_INTERVAL_MINUTES = 5
export const OVERTIME_MAX_CHARGE = 30
export const LATE_THRESHOLD_MINUTES = 10

export const VALID_CAR_TYPES = ['sedan', 'suv', 'mpv', 'van'] as const
export const VALID_SERVICE_PACKAGES = ['standard', 'premium', 'interior', 'full'] as const
export const VALID_PAYMENT_METHODS = ['online', 'onsite', 'member'] as const

export const RESERVATION_GRACE_MINUTES = 15
export const RESERVATION_NO_SHOW_FEE_RATE = 0.3
export const RESERVATION_MAX_AHEAD_DAYS = 7
export const RESERVATION_TIME_SLOT_MINUTES = 30
export const RESERVATION_MAX_SLOTS_PER_BAY = 4

export const MONTHLY_CARD_CONFIG: Record<string, { totalWashes: number; totalReservations: number; price: number }> = {
  basic: { totalWashes: 8, totalReservations: 4, price: 199 },
  premium: { totalWashes: 15, totalReservations: 10, price: 349 },
  ultimate: { totalWashes: 30, totalReservations: 30, price: 599 },
}

export const FAULT_TRANSFER_STRATEGY = {
  MINOR: 'auto_requeue',
  MAJOR: 'auto_requeue_with_refund',
  CRITICAL: 'manual_confirmation_required',
} as const

export const FAULT_REFUND_RATE: Record<string, number> = {
  minor: 0,
  major: 0.2,
  critical: 0.5,
}

export const TIMELINE_EVENT_TYPES = {
  QUEUE: ['queue_join', 'queue_call', 'queue_cancel', 'queue_no_show', 'queue_vip_skip'],
  RESERVATION: ['reservation_create', 'reservation_checkin', 'reservation_no_show', 'reservation_cancel', 'reservation_expire'],
  WASH: ['wash_start', 'wash_complete', 'wash_overtime'],
  FAULT: ['fault_report', 'fault_resolve', 'fault_transfer', 'fault_manual_confirm'],
  ORDER: ['order_transfer', 'order_refund', 'order_pay'],
  BAY: ['bay_idle', 'bay_occupied', 'bay_fault', 'bay_overtime'],
} as const

export function calculateBaseAmount(carType: string, servicePackage: string): number {
  const base = PACKAGE_PRICES[servicePackage] ?? 0
  const surcharge = CAR_TYPE_SURCHARGE[carType] ?? 0
  return base + surcharge
}

export function calculateNoShowFee(baseAmount: number): number {
  return Math.round(baseAmount * RESERVATION_NO_SHOW_FEE_RATE)
}

export function calculateFaultRefund(baseAmount: number, severity: string): number {
  const rate = FAULT_REFUND_RATE[severity] ?? 0
  return Math.round(baseAmount * rate)
}

export function getMonthlyCardBenefits(cardType: string) {
  return MONTHLY_CARD_CONFIG[cardType] ?? MONTHLY_CARD_CONFIG.basic
}
