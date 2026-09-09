"use client";

import dashjs from "dashjs";
import Hls from "hls.js";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { api, mbUrl, preferredSubtitle } from "@/lib/api";
import { attachSubtitleTrack, parseSubtitleCues } from "@/lib/captions";
import { formatClock } from "@/lib/format";
import { clearProgress, entryKey, getHistory, saveProgress } from "@/lib/history";
import { pickPlayableManifest, rewriteRelativeTo } from "@/lib/playback";
import type { MediaDetails, Release, StreamsResponse } from "@/lib/types";
import { ApiError } from "@/lib/types";
import { ArrowLeft, FullscreenIcon, FullscreenExitIcon, PlayIcon, Spinner, VolumeIcon, VolumeMuteIcon } from "@/components/icons";

type Provider = "moviebox" | "fourkhdhub" | "bdix_circleftp" | "bdix_dhakaflix";

interface Props {
  provider: Provider;
  id: string;
  season: number;
  episode: number;
}

interface Loaded {
  streams: StreamsResponse;
  details: MediaDetails;
}

export function WatchPlayer({ provider, id, season, episode }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const dashRef = useRef<dashjs.MediaPlayerClass | null>(null);

  // live-transcode (HLS fallback for HEVC-only sources)
  const hlsRef = useRef<Hls | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const transcodeSessionRef = useRef<string | null>(null);
  const watchdogFiredRef = useRef(false);
  const playingSinceRef = useRef(0);
  const playingRef = useRef(false);
  // codec picture of the last sniffed DASH manifest: null = unknown/fetch failed
  const hevcOnlyRef = useRef<boolean | null>(null);
  const transcodeActiveRef = useRef(false);
  const [transcodeActive, setTranscodeActiveState] = useState(false);
  // source the player is currently bound to (for the watchdog fallback)
  const currentSourceRef = useRef<string | null>(null);

  // imperative DOM refs for the 60fps timeline
  const seekRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const durationRef = useRef<HTMLSpanElement>(null);
  const playedFillRef = useRef<HTMLDivElement>(null);
  const bufferedFillRef = useRef<HTMLDivElement>(null);

  const [state, setState] = useState<"loading" | "ready" | "playing" | "paused" | "error">("loading");
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [active, setActive] = useState<{ source: string; label: string; releaseKey: string } | null>(null);
  const [controls, setControls] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [resumeAsk, setResumeAsk] = useState<{ position: number } | null>(null);
  const [nextUp, setNextUp] = useState<{ season: number; episode: number; title: string } | null>(null);
  const [subLabel, setSubLabel] = useState<string | null>(null);
  const [qualityChoices, setQualityChoices] = useState<{ label: string; release: Release }[]>([]);
  const [tick, setTick] = useState(0);

  const controlsTimer = useRef<number | null>(null);
  const volumeRef = useRef(volume);
  const nextRef = useRef(nextUp);
  const endedRef = useRef(false);
  const subTrackCleanup = useRef<(() => void) | null>(null);

  const setTranscodeActive = useCallback((active: boolean) => {
    transcodeActiveRef.current = active;
    setTranscodeActiveState(active);
  }, []);

  const label = loaded
    ? `${loaded.details.title}${loaded.details.media_type === "series" && season > 0 ? ` · S${season} E${episode}` : ""}`
    : "Loading…";
  const key = entryKey(provider, id, season, episode);

  const saveNow = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.duration || endedRef.current) return;
    saveProgress(key, {
      provider,
      id,
      title: loaded?.details.title ?? label.replace(/ · S\d+ E\d+$/, ""),
      poster: loaded?.details.poster_url ?? null,
      mediaType: loaded?.details.media_type ?? (season > 0 ? "series" : "movie"),
      year: loaded?.details.year ?? null,
      season,
      episode,
      position: video.currentTime,
      duration: video.duration,
    });
  }, [key, provider, id, season, episode, loaded, label]);

  // ---------------- media session (OS media keys + lock screen) ----------------
  const setupMediaSession = useCallback(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    try {
      ms.metadata = new MediaMetadata({
        title: label,
        artist: provider === "moviebox" ? "MovieBox" : "Stream",
      });
      const video = videoRef.current;
      if (!video) return;
      ms.setActionHandler("play", () => void video.play());
      ms.setActionHandler("pause", () => video.pause());
      ms.setActionHandler("seekto", (d) => {
        if (d.seekTime != null) video.currentTime = d.seekTime;
      });
    } catch {
      /* unsupported */
    }
  }, [label, provider]);

  // ---------------- source loading ----------------
  const teardown = useCallback(() => {
    subTrackCleanup.current?.();
    subTrackCleanup.current = null;
    // stop the live transcode: poll, hls playback, session on the backend
    const hls = hlsRef.current;
    if (hls) {
      hlsRef.current = null;
      try {
        hls.destroy();
      } catch {
        /* already torn down */
      }
    }
    const session = transcodeSessionRef.current;
    if (session) {
      transcodeSessionRef.current = null;
      void api.transcodeDelete(session).catch(() => undefined);
    }
    setTranscodeActive(false);
    const dash = dashRef.current;
    if (dash) {
      dashRef.current = null;
      try {
        dash.reset();
      } catch {
        /* already torn down */
      }
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    currentSourceRef.current = null;
  }, [setTranscodeActive]);

  const applyCaptions = useCallback(
    async (resourceId: string | null) => {
      const video = videoRef.current;
      if (!video || provider !== "moviebox") return;
      let subs;
      try {
        subs = await api.captions(id);
      } catch {
        return; // captions are optional
      }
      const pick = preferredSubtitle(subs.subtitles);
      if (!pick) return;
      let text: string;
      try {
        const res = await fetch(`/api/mb/proxy/ticket`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: pick.url, headers: [] }),
          cache: "no-store",
        });
        if (!res.ok) return;
        const { ticket } = (await res.json()) as { ticket: string };
        const subRes = await fetch(`/api/proxy/${ticket}/`, { cache: "no-store" });
        if (!subRes.ok) return;
        text = await subRes.text();
      } catch {
        return;
      }
      const cues = parseSubtitleCues(text);
      if (!cues.length) return;
      subTrackCleanup.current?.();
      subTrackCleanup.current = attachSubtitleTrack(video, pick.name, cues);
      setSubLabel(pick.name);
    },
    [id, provider],
  );

  // ---------------- HEVC fallback: live server-side transcode ----------------
  const ticketFromUrl = useCallback((sourceUrl: string): string | null => {
    const m = sourceUrl.match(/\/api\/proxy\/([0-9a-f]{16,40})\//i);
    return m ? m[1] : null;
  }, []);

  /** True when the HLS index is fetchable and lists at least one media segment. */
  const indexHasSegments = useCallback(async (indexUrl: string): Promise<boolean> => {
    try {
      const res = await fetch(indexUrl, { cache: "no-store" });
      if (!res.ok) return false;
      const text = await res.text();
      return text
        .split("\n")
        .some((line) => line.trim() !== "" && !line.trim().startsWith("#"));
    } catch {
      return false;
    }
  }, []);

  /** Poll the transcode session until the first segment exists (~20s cap). */
  const waitForTranscode = useCallback(
    async (session: string, indexUrl: string): Promise<void> => {
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        const state = await api.transcodeState(session);
        if (state.ready && state.segments >= 1) return;
        if (await indexHasSegments(indexUrl)) return;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      throw new Error("Live transcoding is taking longer than expected — try again.");
    },
    [indexHasSegments],
  );

  const playHls = useCallback(
    (indexUrl: string) => {
      const video = videoRef.current;
      if (!video) return;
      const startPlayback = () => void video.play().catch(() => undefined);
      if (Hls.isSupported()) {
        const hls = new Hls({ maxBufferLength: 40, backBufferLength: 60 });
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          teardown();
          setError("Live transcode playback failed. Retry or pick another source.");
          setState("error");
        });
        hls.on(Hls.Events.MANIFEST_PARSED, startPlayback);
        hls.loadSource(indexUrl);
        hls.attachMedia(video);
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // native HLS (Safari without MSE)
        video.src = indexUrl;
        video.load();
        startPlayback();
      }
    },
    [teardown],
  );

  /** Start transcoding an HEVC-only source, then play the resulting HLS stream. */
  const startTranscode = useCallback(
    async (sourceUrl: string) => {
      const ticket = ticketFromUrl(sourceUrl);
      if (!ticket) {
        setError("This title is HEVC-only and this browser can't decode HEVC. Try another source.");
        setState("error");
        return;
      }
      setError(null);
      setState("loading");
      setTranscodeActive(true);
      try {
        const started = await api.transcodeStart(ticket);
        transcodeSessionRef.current = started.session;
        const indexUrl = mbUrl(started.m3u8_url);
        await waitForTranscode(started.session, indexUrl);
        // torn down or switched to another source while waiting?
        if (!transcodeActiveRef.current || transcodeSessionRef.current !== started.session) return;
        playHls(indexUrl);
      } catch (e) {
        setTranscodeActive(false);
        const session = transcodeSessionRef.current;
        transcodeSessionRef.current = null;
        if (session) void api.transcodeDelete(session).catch(() => undefined);
        if (e instanceof ApiError && e.status === 503) {
          setError(
            "This title is HEVC-only and this browser can't decode HEVC. Install ffmpeg on the server to enable live transcoding, or try another source.",
          );
        } else {
          setError(e instanceof Error ? e.message : "Failed to start live transcoding");
        }
        setState("error");
      }
    },
    [ticketFromUrl, waitForTranscode, playHls, setTranscodeActive],
  );

  const startSource = useCallback(
    async (wantResolution: number | null, candidateOrder: Release[]) => {
      teardown();
      setState("loading");
      setError(null);
      const video = videoRef.current;
      if (!video) return;

      let play;
      try {
        play = await api.play({
          provider,
          id,
          season,
          episode,
          resolution: wantResolution ?? undefined,
        });
      } catch (e) {
        // Fall back to a manual first-mirror source.
        const rel = candidateOrder[0];
        if (rel?.mirrors[0]) {
          const mirror = rel.mirrors[0];
          try {
            const t = await fetch("/api/mb/proxy/ticket", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: mirror.resolver_url, headers: mirror.headers }),
              cache: "no-store",
            });
            const { ticket } = (await t.json()) as { ticket: string };
            const origin = new URL(mirror.resolver_url);
            const playUrl = `/api/proxy/${ticket}/a${origin.pathname}${origin.search}`;
            currentSourceRef.current = playUrl;
            setActive({ source: playUrl, label: rel.filename, releaseKey: `${rel.provider}:${rel.filename}` });
            setState("ready");
            await video.play();
            return;
          } catch {
            /* fall through to error */
          }
        }
        setError(e instanceof Error ? e.message : String(e));
        setState("error");
        return;
      }

      const source = play.play_url;
      currentSourceRef.current = source;
      setActive({
        source,
        label: play.release.filename,
        releaseKey: `${play.release.provider}:${play.release.filename}`,
      });
      const rel = play.release;

      const isDash =
        source.endsWith(".mpd") ||
        rel.quality?.toLowerCase().includes("multi") ||
        rel.mirrors.some((m) => m.resolver_url.includes(".mpd"));

      if (isDash) {
        hevcOnlyRef.current = null;
        watchdogFiredRef.current = false;
        // Sniff the manifest before dash.js: HEVC-only streams are undecodable
        // in Chromium/Linux → fall back to live transcode; mixed streams have
        // their HEVC representations stripped client-side.
        let manifestText: string | null = null;
        try {
          const res = await fetch(source, { cache: "no-store" });
          if (res.ok) manifestText = await res.text();
        } catch {
          /* proxy unreachable — fall through to the original URL */
        }

        let dashSource = source;
        if (manifestText !== null) {
          const decision = pickPlayableManifest(manifestText, video);
          if (decision.mode === "transcode") {
            hevcOnlyRef.current = true;
            void applyCaptions(rel.resource_id ?? null);
            await startTranscode(source);
            return;
          }
          hevcOnlyRef.current = decision.hevcOnly;
          if (decision.stripped) {
            // Relative segment references only resolve from the original
            // location, so rewrite them absolute before serving via Blob URL.
            const baseDir = source.slice(0, source.lastIndexOf("/") + 1);
            const rewritten = rewriteRelativeTo(baseDir, decision.text);
            const blob = new Blob([rewritten], { type: "application/dash+xml" });
            blobUrlRef.current = URL.createObjectURL(blob);
            dashSource = blobUrlRef.current;
          }
        }

        const dash = dashjs.MediaPlayer().create();
        dashRef.current = dash;
        const fatal = (code: number | undefined) =>
          code != null && (code === 27 || code === 34 || code === 2 || code === 11);
        dash.on(dashjs.MediaPlayer.events.ERROR, (data: unknown) => {
          const err = (data as { error?: { code?: number; message?: string } })?.error;
          if (err && (fatal(err.code) || /manifest|initialization/i.test(err.message ?? ""))) {
            setError("Stream manifest could not be loaded — the source may have expired. Try again.");
            setState("error");
          }
        });
        dash.on(dashjs.MediaPlayer.events.PLAYBACK_ERROR, () => {
          setError("Playback failed. The stream may have expired — try again.");
          setState("error");
        });
        try {
          dash.initialize(video, dashSource, true);
          dash.setAutoPlay(false);
          void video.play().catch(() => undefined);
        } catch (e) {
          setError(e instanceof Error ? e.message : "DASH initialization failed");
          setState("error");
          return;
        }
      } else {
        video.src = source;
        video.load();
        void video.play().catch(() => undefined);
      }

      void applyCaptions(rel.resource_id ?? null);
      setState("ready");
    },
    [provider, id, season, episode, teardown, applyCaptions, startTranscode],
  );

  // ---------------- initial load ----------------
  const boot = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const [streams, details] = await Promise.all([
        api.streams(provider, id, season, episode),
        api.details(provider, id).then((d) => d.details),
      ]);
      setLoaded({ streams, details });

      const choices = streams.releases.filter((r) => r.mirrors.length > 0);
      if (!choices.length) {
        setError("No playable sources found for this title.");
        setState("error");
        return;
      }
      const labelOf = (r: Release) => {
        const multi =
          r.quality?.toLowerCase().includes("multi") ||
          r.filename.toLowerCase().includes("multi-res");
        return multi ? "Auto (adaptive)" : (r.quality ?? r.filename ?? `Source ${r.mirrors[0].label}`);
      };
      setQualityChoices(
        choices.map((r) => ({ label: labelOf(r), release: r })),
      );
      await startSource(null, choices);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load playback sources");
      setState("error");
    }
  }, [provider, id, season, episode, startSource]);

  useEffect(() => {
    void boot();
    return () => {
      teardown();
      saveNowRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boot]);

  const saveNowRef = useRef(saveNow);
  saveNowRef.current = saveNow;

  // body lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ---------------- resume prompt ----------------
  useEffect(() => {
    if (state !== "ready" && state !== "playing" && state !== "paused") return;
    const entry = getHistory().find((h) => entryKey(h.provider, h.id, h.season, h.episode) === key);
    if (entry && entry.position > 25 && entry.duration > 0 && entry.position / entry.duration < 0.98) {
      setResumeAsk({ position: entry.position });
    }
  }, [state, key]);

  const resume = (fromStart: boolean) => {
    const video = videoRef.current;
    const pos = resumeAsk?.position ?? 0;
    setResumeAsk(null);
    if (video && !fromStart && pos > 0) {
      const trySeek = () => {
        video.currentTime = pos;
        video.removeEventListener("loadedmetadata", trySeek);
      };
      video.addEventListener("loadedmetadata", trySeek);
      if (video.readyState >= 1) trySeek();
    }
    void video?.play().catch(() => undefined);
  };

  // ---------------- control visibility ----------------
  const pokeControls = useCallback(() => {
    setControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = window.setTimeout(() => {
      const video = videoRef.current;
      if (video && !video.paused) setControls(false);
    }, 3200);
  }, []);

  useEffect(() => {
    pokeControls();
    return () => {
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
    };
  }, [pokeControls, state]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
    pokeControls();
  }, [pokeControls]);

  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(Math.max(0, video.currentTime + delta), video.duration || 0);
    pokeControls();
  }, [pokeControls]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    if (!video.muted && video.volume === 0) {
      video.volume = volumeRef.current || 1;
      setVolume(video.volume);
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void el.requestFullscreen().catch(() => undefined);
  }, []);

  const onVolume = (v: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = v;
    video.muted = v === 0;
    setVolume(v);
    setMuted(v === 0);
    volumeRef.current = v;
  };

  // ---------------- next episode -----------------
  const maybeNextEpisode = useCallback((): { season: number; episode: number; title: string } | null => {
    const details = loaded?.details;
    if (!details || details.media_type !== "series" || season === 0) return null;
    const seasons = details.seasons;
    const current = seasons.find((s) => s.number === season);
    if (!current) return null;
    const idx = current.episodes.findIndex((e) => e.number === episode);
    if (idx >= 0 && idx + 1 < current.episodes.length) {
      const next = current.episodes[idx + 1];
      return { season, episode: next.number, title: next.title ?? `Episode ${next.number}` };
    }
    const nextSeason = seasons.find((s) => s.number === season + 1);
    if (nextSeason && nextSeason.episodes.length > 0) {
      const first = nextSeason.episodes[0];
      return { season: nextSeason.number, episode: first.number, title: first.title ?? `Episode ${first.number}` };
    }
    return null;
  }, [loaded, season, episode]);

  // countdown for next-up
  const nextCountdown = useRef(10);
  const countdownTimer = useRef<number | null>(null);

  const showNextUp = useCallback((n: { season: number; episode: number; title: string } | null) => {
    nextRef.current = n;
    setNextUp(n);
  }, []);

  useEffect(() => {
    if (!nextUp) return;
    nextCountdown.current = 10;
    countdownTimer.current = window.setInterval(() => {
      nextCountdown.current -= 1;
      setTick((t) => t + 1);
      if (nextCountdown.current <= 0) {
        if (countdownTimer.current) clearInterval(countdownTimer.current);
        const n = nextRef.current;
        showNextUp(null);
        if (n) router.push(`/watch/${provider}/${id}?s=${n.season}&e=${n.episode}`);
      }
    }, 1000);
    return () => {
      if (countdownTimer.current) clearInterval(countdownTimer.current);
    };
  }, [nextUp, router, provider, id, showNextUp]);

  // ---------------- keyboard ----------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "SELECT") return;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          seekBy(-10);
          break;
        case "ArrowRight":
          e.preventDefault();
          seekBy(10);
          break;
        case "ArrowUp":
          e.preventDefault();
          onVolume(Math.min(1, volumeRef.current + 0.1));
          break;
        case "ArrowDown":
          e.preventDefault();
          onVolume(Math.max(0, volumeRef.current - 0.1));
          break;
        case "m":
          toggleMute();
          break;
        case "f":
          toggleFullscreen();
          break;
        case "Escape":
          if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
          else if (nextUp) showNextUp(null);
          else if (resumeAsk) setResumeAsk(null);
          else router.back();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [togglePlay, seekBy, toggleMute, toggleFullscreen, nextUp, resumeAsk, router]);

  // ---------------- progress tick ----------------
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const loop = () => {
      if (!Number.isNaN(video.duration)) {
        if (durationRef.current && Math.abs(Number(durationRef.current.dataset.d) - video.duration) > 0.5) {
          durationRef.current.dataset.d = String(video.duration);
          durationRef.current.textContent = formatClock(video.duration);
        }
        const pct = (video.currentTime / video.duration) * 100;
        if (seekRef.current) {
          seekRef.current.max = String(Math.floor(video.duration));
          seekRef.current.value = String(Math.floor(video.currentTime));
          seekRef.current.style.setProperty("--progress", `${pct}%`);
        }
        if (timeRef.current) timeRef.current.textContent = formatClock(video.currentTime);
        if (playedFillRef.current) playedFillRef.current.style.width = `${pct}%`;
        // buffered range (first buffered segment)
        if (bufferedFillRef.current && video.buffered.length > 0) {
          const end = video.buffered.end(video.buffered.length - 1);
          bufferedFillRef.current.style.width = `${(end / video.duration) * 100}%`;
        }
      }
      requestAnimationFrame(loop);
    };
    const raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---------------- periodic progress persistence ----------------
  useEffect(() => {
    const id = window.setInterval(() => {
      const video = videoRef.current;
      if (video && !video.paused && !endedRef.current) saveNow();
    }, 10_000);
    return () => window.clearInterval(id);
  }, [saveNow]);

  // ---------------- player events ----------------
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => {
      endedRef.current = false;
      playingRef.current = true;
      playingSinceRef.current = Date.now();
      setState("playing");
      setControls(true);
      pokeControls();
      setupMediaSession();
    };
    const onPause = () => {
      playingRef.current = false;
      setState("paused");
      setControls(true);
      saveNow();
    };
    const onEnded = () => {
      endedRef.current = true;
      playingRef.current = false;
      clearProgress(key);
      const next = maybeNextEpisode();
      if (next) {
        showNextUp({ ...next });
      } else {
        setState("paused");
        setControls(true);
      }
    };
    const onError = () => {
      if (!video.error) return;
      const code = video.error.code;
      if (code === 4) {
        setError("This stream can't be played in your browser (unsupported codec or expired link).");
      } else if (code === 2) {
        setError("Network error while streaming — check your connection and retry.");
      } else {
        setError("Playback error — the source may have expired. Go back and try again.");
      }
      setState("error");
    };
    const onVolumeChange = () => {
      setMuted(video.muted);
      setVolume(video.volume);
      volumeRef.current = video.volume;
    };
    const onFsChange = () => setFullscreen(Boolean(document.fullscreenElement));
    const onWaiting = () => {
      setBuffering(true);
      setControls(false);
    };
    const onPlaying = () => {
      setBuffering(false);
    };
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);
    video.addEventListener("volumechange", onVolumeChange);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
      video.removeEventListener("volumechange", onVolumeChange);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      document.removeEventListener("fullscreenchange", onFsChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pokeControls, saveNow, maybeNextEpisode, key, showNextUp]);

  // ---------------- watchdog: DASH "playing but black" fallback ----------------
  // Some browsers partially advertise HEVC support and then never decode a
  // frame. If a DASH source that is HEVC-only (or of unknown codecs) has been
  // "playing" for ≥6s with no decoded frame, tear it down and retry that same
  // source through the live transcoder, once.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      if (watchdogFiredRef.current) return;
      if (transcodeActiveRef.current || !playingRef.current) return;
      if (Date.now() - playingSinceRef.current < 6000) return;
      if (video.videoWidth > 0 || video.paused) return;
      if (hevcOnlyRef.current === false) return; // decodable AVC — not our case
      const activeSource = currentSourceRef.current;
      if (!activeSource || !(dashRef.current || blobUrlRef.current)) return;
      watchdogFiredRef.current = true;
      teardown();
      setState("loading");
      setError(null);
      void startTranscode(activeSource);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [teardown, startTranscode]);

  const showSpinner = state === "loading";
  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-40 bg-black"
      onMouseMove={pokeControls}
      onTouchStart={pokeControls}
      onDoubleClick={toggleFullscreen}
    >
      <video
        ref={videoRef}
        className="h-full w-full"
        playsInline
        onClick={togglePlay}
      />

      {/* top scrim + back */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-10 h-32 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300 ${
          controls ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        className={`absolute left-0 top-0 z-20 flex w-full items-center gap-4 p-5 transition-opacity duration-300 md:p-7 ${
          controls ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <button
          onClick={() => (fullscreen ? void document.exitFullscreen() : router.back())}
          aria-label="Back"
          className="grid h-11 w-11 place-items-center rounded-full bg-black/50 text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-black/80"
        >
          <ArrowLeft width={20} height={20} />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold text-white md:text-xl">{label}</h1>
          <p className="text-xs text-zinc-400">
            {provider === "moviebox" ? "MovieBox" : provider}
            {active ? ` · ${active.label.replace(/\.(mp4|mkv|mpd)$/i, "")}` : ""}
            {subLabel ? ` · CC: ${subLabel}` : ""}
            {transcodeActive ? " · live transcode" : ""}
          </p>
        </div>
      </div>

      {/* live-transcode status pill (always visible while transcoding) */}
      {transcodeActive && (
        <div className="pointer-events-none absolute right-4 top-4 z-30 flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/15 backdrop-blur md:right-7 md:top-7">
          <span className="h-2 w-2 rounded-full bg-brand" />
          <span className="text-xs font-medium text-white/80">Live transcode</span>
        </div>
      )}

      {/* center play / spinner */}
      {showSpinner && (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
          <Spinner width={56} height={56} className="animate-spin text-white/80" />
        </div>
      )}
      {buffering && state === "playing" && (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
          <Spinner width={44} height={44} className="animate-spin text-white/70" />
        </div>
      )}
      {state === "paused" && !nextUp && !resumeAsk && (
        <button
          onClick={togglePlay}
          aria-label="Play"
          className="absolute inset-0 z-20 grid place-items-center"
        >
          <span className="grid h-24 w-24 place-items-center rounded-full bg-white/10 ring-1 ring-white/30 backdrop-blur-md transition hover:scale-105 hover:bg-white/20">
            <PlayIcon width={38} height={38} className="translate-x-1 text-white" />
          </span>
        </button>
      )}

      {/* error */}
      {state === "error" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-black/90 px-6 text-center backdrop-blur">
          <p className="text-4xl">⚠️</p>
          <h2 className="text-xl font-bold text-white">Playback unavailable</h2>
          <p className="max-w-md text-sm text-zinc-400">{error}</p>
          <div className="flex gap-3">
            <button
              onClick={() => void boot()}
              className="rounded-lg bg-white px-6 py-2.5 text-sm font-bold text-black transition hover:bg-zinc-200"
            >
              Retry
            </button>
            <button
              onClick={() => router.push(`/title/${provider}/${id}`)}
              className="rounded-lg bg-white/15 px-6 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/25"
            >
              Back to title
            </button>
          </div>
        </div>
      )}

      {/* resume prompt */}
      {resumeAsk && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-[min(92vw,430px)] rounded-2xl border border-white/10 bg-surface p-7 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Resume watching?</h3>
            <p className="mt-1 text-sm text-zinc-400">Continue from {formatClock(resumeAsk.position)}?</p>
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                onClick={() => resume(false)}
                className="rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-hover"
              >
                Resume from {formatClock(resumeAsk.position)}
              </button>
              <button
                onClick={() => resume(true)}
                className="rounded-lg bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
              >
                Start over
              </button>
            </div>
          </div>
        </div>
      )}

      {/* next-up */}
      {nextUp && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60">
          <div className="w-[min(92vw,560px)] overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-2xl">
            <div className="flex items-center justify-between bg-gradient-to-r from-brand/25 to-transparent px-6 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand">Up next</p>
                <p className="mt-0.5 text-lg font-bold text-white">
                  S{nextUp.season} E{nextUp.episode} · {nextUp.title}
                </p>
              </div>
              <span className="text-sm font-semibold text-zinc-300">{Math.max(0, nextCountdown.current)}s</span>
            </div>
            <div className="flex gap-3 p-5">
              <button
                onClick={() => router.push(`/watch/${provider}/${id}?s=${nextUp.season}&e=${nextUp.episode}`)}
                className="flex-1 rounded-lg bg-white px-4 py-3 text-sm font-bold text-black transition hover:bg-zinc-200"
              >
                Play now
              </button>
              <button
                onClick={() => showNextUp(null)}
                className="flex-1 rounded-lg bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/20"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* bottom controls */}
      <div
        className={`absolute inset-x-0 bottom-0 z-20 transition-opacity duration-300 ${
          controls ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div className="px-5 pb-2 md:px-7">
          <div className="relative mb-3 h-1.5 w-full rounded-full bg-white/20">
            <div ref={bufferedFillRef} className="absolute inset-y-0 left-0 rounded-full bg-white/35" style={{ width: "0%" }} />
            <div ref={playedFillRef} className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: "0%" }} />
            <input
              ref={seekRef}
              type="range"
              min={0}
              max={0}
              step={1}
              value={0}
              aria-label="Seek"
              className="player-range absolute inset-0 h-full w-full opacity-0"
              onPointerUp={(e) => {
                const video = videoRef.current;
                const target = e.currentTarget;
                if (!video) return;
                const pct = Number(target.value) / Number(target.max || 1);
                if (Number.isFinite(pct)) video.currentTime = pct * (video.duration || 0);
              }}
            />
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <button onClick={togglePlay} aria-label={state === "playing" ? "Pause" : "Play"} className="grid h-11 w-11 place-items-center rounded-full text-white transition hover:bg-white/15">
              {state === "playing" ? (
                <svg viewBox="0 0 24 24" width={26} height={26} fill="currentColor"><path d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z" /></svg>
              ) : (
                <PlayIcon width={26} height={26} className="translate-x-0.5" />
              )}
            </button>
            <button onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} className="grid h-11 w-11 place-items-center rounded-full text-white transition hover:bg-white/15">
              {muted || volume === 0 ? <VolumeMuteIcon width={24} height={24} /> : <VolumeIcon width={24} height={24} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              aria-label="Volume"
              onChange={(e) => onVolume(Number(e.target.value))}
              className="w-20 accent-brand"
            />
            <span className="ml-1 text-sm tabular-nums text-zinc-300">
              <span ref={timeRef}>0:00</span>
              <span className="mx-1 text-zinc-600">/</span>
              <span ref={durationRef} data-d="-1">–:––</span>
            </span>

            {qualityChoices.length > 1 && (
              <div className="ml-auto hidden items-center gap-1.5 sm:flex">
                {transcodeActive && (
                  <span className="flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white/80 ring-1 ring-white/15">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                    Transcode
                  </span>
                )}
                {qualityChoices.map((c) => {
                  const key = `${c.release.provider}:${c.release.filename}`;
                  const isActive = active?.releaseKey === key;
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        const digits = c.release.quality?.match(/\d+/);
                        const others = qualityChoices.filter((x) => x !== c).map((x) => x.release);
                        void startSource(digits ? Number(digits[0]) : null, [c.release, ...others]);
                      }}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                        isActive ? "bg-brand text-white" : "bg-white/10 text-zinc-200 hover:bg-white/20"
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="ml-auto flex items-center gap-2 sm:ml-0">
              <button onClick={toggleFullscreen} aria-label="Fullscreen" className="grid h-11 w-11 place-items-center rounded-full text-white transition hover:bg-white/15">
                {fullscreen ? <FullscreenExitIcon width={24} height={24} /> : <FullscreenIcon width={24} height={24} />}
              </button>
            </div>
          </div>
        </div>
        <div className="h-8 bg-gradient-to-t from-black/90 to-transparent" />
      </div>
    </div>
  );
}
