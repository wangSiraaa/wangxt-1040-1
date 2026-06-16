const BASE = "/api";

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error || "请求失败");
  }
  return json.data as T;
}

function post<T>(path: string, body?: unknown) {
  return request<T>(path, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
}

function patch<T>(path: string, body?: unknown) {
  return request<T>(path, {
    method: "PATCH",
    body: body ? JSON.stringify(body) : undefined,
  });
}

function del<T>(path: string) {
  return request<T>(path, { method: "DELETE" });
}

// ── Bays ──
export const fetchBays = () => request<any[]>("/bays");

export const updateBayStatus = (id: number, status: string) =>
  patch<any>(`/bays/${id}/status`, { status });

export const releaseBay = (id: number, operatorName: string) =>
  post<any>(`/bays/${id}/release`, { operator_name: operatorName });

export const forceCompleteBay = (id: number, operatorName: string) =>
  post<any>(`/bays/${id}/force-complete`, { operator_name: operatorName });

// ── Queue ──
export const fetchQueue = () => request<any[]>("/queue");

export const checkEligibility = (data: {
  car_type: string;
  service_package: string;
  payment_method: string;
  plate_number: string;
  estimated_arrival_minutes?: number;
}) => post<any>("/queue/check-eligibility", data);

export const joinQueue = (data: {
  plate_number: string;
  car_type: string;
  service_package: string;
  payment_method: string;
  estimated_arrival_minutes?: number;
}) => post<any>("/queue/join", data);

export const callNext = () => post<any>("/queue/call-next");

export const leaveQueue = (id: number) => del<any>(`/queue/${id}`);

// ── Orders ──
export const fetchOrders = (status?: string) =>
  request<any[]>(`/orders${status ? `?status=${status}` : ""}`);

export const fetchOrder = (id: number) => request<any>(`/orders/${id}`);

export const changePackage = (
  id: number,
  newPackage: string,
  operatorName: string
) =>
  patch<any>(`/orders/${id}/package`, {
    service_package: newPackage,
    operator_name: operatorName,
  });

export const cancelOrder = (
  id: number,
  reason: string,
  operatorName: string
) => post<any>(`/orders/${id}/cancel`, { reason, operator_name: operatorName });

export const payOrder = (id: number) => patch<any>(`/orders/${id}/pay`);

export const startWash = (id: number) =>
  post<any>(`/orders/${id}/start-wash`);

export const overtimeCharge = (
  id: number,
  amount: number,
  operatorName: string
) =>
  post<any>(`/orders/${id}/overtime-charge`, {
    amount,
    operator_name: operatorName,
  });

// ── Faults ──
export const fetchFaults = (status?: string) =>
  request<any[]>(`/faults${status ? `?status=${status}` : ""}`);

export const reportFault = (data: {
  bay_id: number;
  fault_type: string;
  severity: string;
  description?: string;
  estimated_loss_cents?: number;
  reported_by: string;
}) => post<any>("/faults", data);

export const resolveFault = (id: number, resolvedBy: string) =>
  patch<any>(`/faults/${id}/resolve`, { resolved_by: resolvedBy });

export const fetchFaultStats = () => request<any>("/faults/stats");

// ── Stats ──
export const fetchRevenueStats = () => request<any>("/stats/revenue");

export const fetchOvertimeStats = () => request<any>("/stats/overtime");

export const fetchFaultLossStats = () => request<any>("/stats/fault-loss");

export const fetchCancellationStats = () =>
  request<any>("/stats/cancellation");

export const fetchOverview = () => request<any>("/stats/overview");

// ── Faults Extras ──
export const fetchPendingTransfers = () =>
  request<any[]>("/faults/transfers/pending");

export const fetchFaultTransfers = (faultId: number) =>
  request<any[]>(`/faults/${faultId}/transfers`);

export const executeTransfer = (id: number, operatorName: string) =>
  post<any>(`/faults/transfers/${id}/execute`, {
    operator_name: operatorName,
  });

export const confirmManualTransfer = (
  id: number,
  decision: "refund" | "requeue",
  operatorName: string,
  customRefundAmount?: number
) =>
  post<any>(`/faults/transfers/${id}/confirm`, {
    decision,
    operator_name: operatorName,
    custom_refund_amount: customRefundAmount,
  });

// ── Reservations ──
export const fetchReservations = (
  status?: string,
  startDate?: string,
  endDate?: string
) => {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (startDate) params.set("start_date", startDate);
  if (endDate) params.set("end_date", endDate);
  const qs = params.toString();
  return request<any[]>(`/reservations${qs ? `?${qs}` : ""}`);
};

export const fetchAvailableTimeSlots = (date?: string) =>
  request<any[]>(
    `/reservations/available-slots${date ? `?date=${date}` : ""}`
  );

export const createReservation = (data: {
  plate_number: string;
  car_type: string;
  service_package: string;
  reserved_time: string;
  grace_minutes?: number;
  operator_name?: string;
}) => post<any>("/reservations", data);

export const checkInReservation = (
  id: number,
  data?: { operator_name?: string }
) => post<any>(`/reservations/${id}/check-in`, data);

export const vipSkipLine = (id: number, operatorName: string) =>
  post<any>(`/reservations/${id}/skip-line`, {
    operator_name: operatorName,
  });

export const markReservationNoShow = (id: number, operatorName: string) =>
  post<any>(`/reservations/${id}/no-show`, {
    operator_name: operatorName,
  });

export const cancelReservation = (
  id: number,
  reason: string,
  operatorName: string
) =>
  post<any>(`/reservations/${id}/cancel`, {
    reason,
    operator_name: operatorName,
  });

// ── Monthly Cards ──
export const fetchMonthlyCards = (status?: string) =>
  request<any[]>(
    `/monthly-cards${status ? `?status=${status}` : ""}`
  );

export const fetchMonthlyCard = (plateNumber: string) =>
  request<any>(`/monthly-cards/${plateNumber}`);

export const fetchMonthlyCardEligibility = (plateNumber: string) =>
  request<any>(`/monthly-cards/${plateNumber}/eligibility`);

export const createMonthlyCard = (data: {
  plate_number: string;
  card_type: "basic" | "premium" | "ultimate";
  operator_name?: string;
}) => post<any>("/monthly-cards", data);

export const useMonthlyCardWash = (id: number, operatorName: string) =>
  post<any>(`/monthly-cards/${id}/use-wash`, {
    operator_name: operatorName,
  });

export const useMonthlyCardReservation = (
  id: number,
  operatorName: string
) =>
  post<any>(`/monthly-cards/${id}/use-reservation`, {
    operator_name: operatorName,
  });

export const refundMonthlyCardWash = (id: number, operatorName: string) =>
  post<any>(`/monthly-cards/${id}/refund-wash`, {
    operator_name: operatorName,
  });

// ── Timeline ──
export const fetchTimelineEvents = (options?: {
  limit?: number;
  offset?: number;
  eventTypes?: string[];
  bayId?: number;
  orderId?: number;
  startTime?: string;
  endTime?: string;
}) => {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));
  if (options?.eventTypes?.length)
    params.set("event_types", options.eventTypes.join(","));
  if (options?.bayId) params.set("bay_id", String(options.bayId));
  if (options?.orderId) params.set("order_id", String(options.orderId));
  if (options?.startTime) params.set("start_time", options.startTime);
  if (options?.endTime) params.set("end_time", options.endTime);
  const qs = params.toString();
  return request<any[]>(`/timeline${qs ? `?${qs}` : ""}`);
};

export const fetchQueueTimeline = (limit: number = 50) =>
  request<any[]>(`/timeline/queue?limit=${limit}`);

export const addTimelineEvent = (data: any) =>
  post<any>("/timeline", data);

// ── Stats Extras ──
export const fetchReservationStats = () =>
  request<any>("/stats/reservations");

export const fetchFaultTransferStats = () =>
  request<any>("/stats/fault-transfers");

export const fetchMonthlyCardStats = () =>
  request<any>("/stats/monthly-cards");

// ── Operation Logs ──
export const fetchOperationLogs = (limit?: number, offset?: number) => {
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  if (offset) params.set("offset", String(offset));
  const qs = params.toString();
  return request<any[]>(`/operation-logs${qs ? `?${qs}` : ""}`);
};
