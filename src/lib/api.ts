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

// ── Operation Logs ──
export const fetchOperationLogs = (limit?: number, offset?: number) => {
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  if (offset) params.set("offset", String(offset));
  const qs = params.toString();
  return request<any[]>(`/operation-logs${qs ? `?${qs}` : ""}`);
};
