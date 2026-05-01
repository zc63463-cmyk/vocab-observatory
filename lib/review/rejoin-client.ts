export interface ReviewRejoinResult {
  errorMessage?: string;
  ok: boolean;
}

const DEFAULT_ERROR_MESSAGE = "立即复习失败";

/**
 * Posts to /api/review/rejoin and normalizes any failure into a string-only
 * `errorMessage`. The caller (a React component) only needs to render a toast
 * with the message and switch UI state — no fetch/JSON branches in the UI layer.
 *
 * Contract guarantees:
 * - Returns `{ ok: true }` only when the response is HTTP 2xx AND `payload.ok === true`.
 * - On network error (`fetch` rejects), returns the thrown message.
 * - On invalid/missing JSON body, returns the default message.
 * - When the server's `error` field is not a string (e.g. a zod flatten object),
 *   the default message is used so the UI never renders `[object Object]`.
 *
 * @param progressId The user_word_progress.id row to bring forward.
 * @param fetchImpl Injected for tests; defaults to the global `fetch`.
 */
export async function submitReviewRejoin(
  progressId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ReviewRejoinResult> {
  let response: Response;
  try {
    response = await fetchImpl("/api/review/rejoin", {
      body: JSON.stringify({ progressId }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  } catch (error) {
    return {
      errorMessage: error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE,
      ok: false,
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const payloadObj = (payload && typeof payload === "object") ? (payload as Record<string, unknown>) : null;
  const serverError = payloadObj?.error;
  const serverOk = payloadObj?.ok === true;

  if (!response.ok || !serverOk) {
    return {
      errorMessage: typeof serverError === "string" ? serverError : DEFAULT_ERROR_MESSAGE,
      ok: false,
    };
  }

  return { ok: true };
}
