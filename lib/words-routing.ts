const WORD_FILTER_KEYS = ["q", "semantic", "freq", "review"] as const;

type SearchParamValue = string | string[] | undefined;
type SearchParamRecord = Record<string, SearchParamValue>;

function appendWordFilterParams(
  target: URLSearchParams,
  source: URLSearchParams | SearchParamRecord,
) {
  for (const key of WORD_FILTER_KEYS) {
    const rawValue = source instanceof URLSearchParams ? source.get(key) : source[key];
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;

    if (!value) {
      continue;
    }

    target.set(key, value);
  }
}

export function buildWordsListHref(source?: URLSearchParams | SearchParamRecord) {
  const params = new URLSearchParams();

  if (source) {
    appendWordFilterParams(params, source);
  }

  const query = params.toString();
  return query ? `/words?${query}` : "/words";
}

export function buildWordDetailHref(slug: string, source?: URLSearchParams | SearchParamRecord) {
  const basePath = `/words/${slug}`;
  const params = new URLSearchParams();

  if (source) {
    appendWordFilterParams(params, source);
  }

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
