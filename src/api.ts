/**
 * Store Market API client.
 * All requests use same-origin Pages Functions and cookie sessions.
 * Never store passwords or session tokens in localStorage.
 */
export type ApiUser = { id: string; email: string; name: string; role: "owner" | "seller" | "customer"; status?: string };
export type ApiProduct = {
  id: string; name: string; description?: string; category: string;
  price_dzd: number; stock: number; image_url?: string; seller_id: string;
};
export type ApiOrderItem = { product_id: string; quantity: number };
export type ApiError = Error & { status?: number };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/${path.replace(/^\/+/, "")}`, {
    ...init,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `HTTP ${response.status}`) as ApiError;
    error.status = response.status;
    throw error;
  }
  return payload as T;
}

export const storeApi = {
  health: () => request<{ ok: boolean; service: string; database: string }>("health", { method: "GET" }),
  register: (input: { name: string; email: string; password: string; role: "customer" | "seller" }) =>
    request<{ ok: boolean; message: string }>("auth/register", { method: "POST", body: JSON.stringify(input) }),
  login: (email: string, password: string) =>
    request<{ user: ApiUser }>("auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => request<{ user: ApiUser }>("auth/me", { method: "GET" }),
  logout: () => request<{ ok: boolean }>("auth/logout", { method: "POST" }),
  products: () => request<{ products: ApiProduct[] }>("products", { method: "GET" }),
  createSellerProduct: (input: { name: string; description?: string; category: string; price_dzd: number; stock: number; image_url?: string }) =>
    request<{ ok: boolean; id: string; message: string }>("seller/products", { method: "POST", body: JSON.stringify(input) }),
  createDemoCodOrder: (input: { customer_name: string; phone: string; wilaya: string; address: string; items: ApiOrderItem[] }) =>
    request<{ ok: boolean; order_id: string; total_dzd: number; payment_method: "cod_demo"; message: string }>(
      "orders", { method: "POST", body: JSON.stringify(input) }
    ),
  sellerOrders: () => request<{ orders: Array<Record<string, unknown>> }>("seller/orders", { method: "GET" }),
  customerOrders: () => request<{ orders: Array<Record<string, unknown>> }>("customer/orders", { method: "GET" }),
  adminOrders: () => request<{ orders: Array<Record<string, unknown>> }>("admin/orders", { method: "GET" }),
  setOrderStatus: (id: string, status: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled") =>
    request<{ ok: boolean }>(`admin/orders/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  adminOverview: () => request<{ users: number; sellers: number; products: number; orders: number }>("admin/overview", { method: "GET" }),
  adminSellers: () => request<{ sellers: Array<Record<string, unknown>> }>("admin/sellers", { method: "GET" }),
  setSellerStatus: (id: string, status: "active" | "pending" | "suspended") =>
    request<{ ok: boolean }>(`admin/sellers/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  adminProducts: () => request<{ products: ApiProduct[] }>("admin/products", { method: "GET" }),
  setProductStatus: (id: string, status: "active" | "pending" | "rejected") =>
    request<{ ok: boolean }>(`admin/products/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) }),
};
