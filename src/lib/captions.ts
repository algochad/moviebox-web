export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

/** Parses SRT or WebVTT text into normalized cues (times in seconds). */
export function parseSubtitleCues(source: string): SubtitleCue[] {
  const text = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const body = text.startsWith("WEBVTT") ? text.replace(/^WEBVTT[^\n]*\n/, "") : text;
  const blocks = body.split(/\n{2,}/);
  const cues: SubtitleCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length < 2) continue;
    let idx = 0;
    // Skip numeric SRT sequence ids.
    if (/^\d+$/.test(lines[0].trim())) idx = 1;
    const timing = lines[idx];
    if (!timing || !timing.includes("-->")) continue;
    const [startRaw, endRaw] = timing.split("-->");
    const start = toSeconds(startRaw);
    const end = toSeconds(endRaw);
    if (start == null || end == null || end <= start) continue;
    const content = lines.slice(idx + 1).join("\n").trim();
    if (content) cues.push({ start, end, text: content });
  }
  return cues;
}

function toSeconds(raw: string): number | null {
  const match = raw.trim().replace(",", ".").match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (!match) return null;
  const h = Number(match[1] ?? 0);
  const m = Number(match[2]);
  const s = Number(match[3]);
  const frac = Number(`0.${match[4] ?? "0"}`);
  return h * 3600 + m * 60 + s + frac;
}

/**
 * Attaches external cues to a video element as a rendered text track.
 * Works for both native playback and MSE-based players (dash.js).
 */
export function attachSubtitleTrack(
  video: HTMLVideoElement,
  label: string,
  cues: SubtitleCue[],
): () => void {
  const track = video.addTextTrack("subtitles", label, "en");
  track.mode = "showing";
  const vtt = typeof (window as unknown as { VTTCue?: unknown }).VTTCue !== "undefined";
  for (const cue of cues) {
    try {
      if (vtt) {
        const c = new VTTCue(cue.start, cue.end, cue.text);
        track.addCue(c);
      } else {
        // Safari fallback: cue must be constructed after a tiny delay.
        const LegacyCue = window.TextTrackCue as unknown as new (
          start: number,
          end: number,
          text: string,
        ) => TextTrackCue;
        track.addCue(new LegacyCue(cue.start, cue.end, cue.text));
      }
    } catch {
      /* skip malformed cue */
    }
  }
  return () => {
    try {
      for (const cue of Array.from(track.cues ?? [])) track.removeCue(cue);
    } catch {
      /* ignore */
    }
  };
}
