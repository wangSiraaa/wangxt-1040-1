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

export function calculateBaseAmount(carType: string, servicePackage: string): number {
  const base = PACKAGE_PRICES[servicePackage] ?? 0
  const surcharge = CAR_TYPE_SURCHARGE[carType] ?? 0
  return base + surcharge
}
