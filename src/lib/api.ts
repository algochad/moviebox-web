import {
  ApiError,
  ApiErrorShape,
  CaptionsResponse,
  DetailsResponse,
  HealthResponse,
  HomeResponse,
  PlayResponse,
  ProviderId,
  SearchResponse,
  StreamsResponse,
  SubtitleOption,
} from "@/lib/types";

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/mb${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), ...JSON_HEADERS },
    cache: "no-store",
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as ApiErrorShape;
      if (body?.error) message = body.error;
    } catch {
      /* non-json body */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => request<HealthResponse>("/health"),
  home: (tab = "2", page = 1) => request<HomeResponse>(`/home?tab=${tab}&page=${page}`),
  search: (q: string, provider: ProviderId = "moviebox", page = 1) =>
    request<SearchResponse>(`/search?q=${encodeURIComponent(q)}&provider=${provider}&page=${page}`),
  suggest: (q: string) => request<{ query: string; suggestions: string[] }>(`/suggest?q=${encodeURIComponent(q)}`),
  details: (provider: ProviderId, id: string) =>
    request<DetailsResponse>(`/details?provider=${provider}&id=${encodeURIComponent(id)}`),
  streams: (provider: ProviderId, id: string, season = 0, episode = 0) =>
    request<StreamsResponse>(
      `/streams?provider=${provider}&id=${encodeURIComponent(id)}&season=${season}&episode=${episode}`,
    ),
  captions: (id: string) => request<CaptionsResponse>(`/captions?id=${encodeURIComponent(id)}`),
  play: (body: {
    provider: ProviderId;
    id: string;
    season?: number;
    episode?: number;
    resolution?: number;
  }) =>
    request<PlayResponse>("/play", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

/** Pick captions for a title; prefers English, falls back to the first option. */
export function preferredSubtitle(subtitles: SubtitleOption[]): SubtitleOption | null {
  if (!subtitles.length) return null;
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  return (
    subtitles.find((s) => clean(s.name).includes("english") && !clean(s.name).includes("spanish")) ??
    subtitles.find((s) => clean(s.name) === "english") ??
    subtitles[0]
  );
}
