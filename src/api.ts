export class ApiError extends Error {
  constructor(
    message: string,
    public fields: Record<string, string> = {},
    public status = 0,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api" + path, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (data?.error?.code === "demo_session_required")
      window.dispatchEvent(new Event("demo-session-expired"));
    throw new ApiError(
      data?.error?.message || `Request failed (${response.status}).`,
      data?.error?.fields || {},
      response.status,
    );
  }
  if (data === null)
    throw new Error("The server returned an unreadable response.");
  return data as T;
}
export const write = (method: string, data?: unknown): RequestInit => ({
  method,
  ...(data === undefined ? {} : { body: JSON.stringify(data) }),
});
export function formatDate(value: string) {
  return new Date(
    value.length === 10 ? value + "T12:00:00" : value,
  ).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
export const today = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
export const percent = (value: number | null | undefined) =>
  value == null ? "—" : `${value.toFixed(1)}%`;
