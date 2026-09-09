// Client-side HEVC handling for DASH sources.
//
// MovieBox DASH manifests are frequently HEVC-only (`codecs="hev1..."`), which
// Chromium/Linux and most Chrome builds cannot decode through MSE: dash.js then
// plays only the audio AdaptationSet → black screen with an advancing timeline.
// These helpers sniff a manifest for HEVC-only content and either strip the HEVC
// representations (when AVC alternatives exist) or flag the source for live
// server-side transcoding.

export interface Sniff {
  /** normalized video codec families present, e.g. ["hevc"] or ["hevc","avc"] */
  videoCodecs: string[];
  /** video is HEVC-only (true only when at least one video codec is HEVC and none are AVC) */
  hevcOnly: boolean;
  /** at least one AVC (avc1/avc3) video codec present */
  hasAvc: boolean;
}

export type ManifestDecision =
  | { mode: "transcode"; hevcOnly: true }
  | {
      mode: "dash";
      /** manifest text to feed the player (stripped, rewritten, or original) */
      text: string;
      /** true when the text was produced by stripping HEVC representations */
      stripped: boolean;
      /** manifest contained HEVC video with no AVC fallback */
      hevcOnly: boolean;
    };

const ADAPTATION_SET_RE = /<AdaptationSet\b[^>]*>[\s\S]*?<\/AdaptationSet>/gi;

/** Normalize a codecs= attribute payload into a set of known families. */
function codecFamilies(codecsAttr: string): string[] {
  const out: string[] = [];
  for (const raw of codecsAttr.split(",")) {
    const fam = raw.trim().split(".")[0].toLowerCase();
    if (fam === "hev1" || fam === "hvc1") out.push("hevc");
    else if (fam === "avc1" || fam === "avc3") out.push("avc");
    // unknown families (mp4a, ec-3, dvh1, ...) are ignored
  }
  return out;
}

function collectFamilies(scope: string): string[] {
  const seen = new Set<string>();
  const re = /codecs\s*=\s*["']([^"']*)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(scope)) !== null) {
    for (const fam of codecFamilies(m[1])) seen.add(fam);
  }
  return [...seen];
}

/**
 * Scan a DASH manifest for its video codec families.
 *
 * Audio-only AdaptationSets are ignored by looking for a
 * `contentType="video"` / `mimeType="video/..."` marker inside each set.
 * If no set carries a video marker at all (defensive), every set that lists
 * codecs is treated as video so we still detect HEVC-only streams.
 */
export function sniffManifest(text: string): Sniff {
  const sets: string[] = [];
  let m: RegExpExecArray | null;
  const adaptRe = new RegExp(ADAPTATION_SET_RE.source, "gi");
  while ((m = adaptRe.exec(text)) !== null) sets.push(m[0]);

  const families = new Set<string>();
  let sawVideoMarker = false;
  for (const set of sets) {
    const lower = set.toLowerCase();
    const isVideo =
      /contentType\s*=\s*["']video["']/.test(lower) ||
      /mimeType\s*=\s*["']video\//.test(lower);
    if (isVideo) sawVideoMarker = true;
  }
  for (const set of sets) {
    const lower = set.toLowerCase();
    const isVideo =
      /contentType\s*=\s*["']video["']/.test(lower) ||
      /mimeType\s*=\s*["']video\//.test(lower);
    // With no explicit markers anywhere, trust every coded set as video.
    if (sawVideoMarker && !isVideo) continue;
    for (const fam of collectFamilies(set)) families.add(fam);
  }

  // No <AdaptationSet> structure at all — scan the document defensively.
  if (!sets.length) {
    for (const fam of collectFamilies(text)) families.add(fam);
  }

  const videoCodecs = [...families];
  const hasAvc = videoCodecs.includes("avc");
  const hasHevc = videoCodecs.includes("hevc");
  return { videoCodecs, hevcOnly: hasHevc && !hasAvc, hasAvc };
}

export interface StripResult {
  text: string;
  removed: number;
}

/**
 * Remove HEVC `<Representation>` elements from a manifest that also contains
 * AVC video representations. String-level, no DOM required. Returns the input
 * untouched (removed: 0) unless both HEVC and AVC video codecs are present.
 */
export function stripHevcManifest(text: string): StripResult {
  const sniff = sniffManifest(text);
  if (!sniff.hasAvc || !sniff.videoCodecs.includes("hevc")) {
    return { text, removed: 0 };
  }
  const repRe = /<Representation\b[^>]*>[\s\S]*?<\/Representation>/gi;
  const hevcRep =
    /<Representation\b[^>]*\bcodecs\s*=\s*["'](hev1|hvc1)\b[^>]*>/i;
  let removed = 0;
  const out = text.replace(repRe, (whole) => {
    if (hevcRep.test(whole)) {
      removed += 1;
      return "";
    }
    return whole;
  });
  return { text: out, removed };
}

/**
 * True when the browser can decode HEVC (H.265) in a media element. Probes both
 * the `hev1` and `hvc1` sample-entry forms used by MPEG-DASH and includes a
 * Safari hint (older Safari builds only advertise the bare short form).
 */
export function browserSupportsHevc(videoEl?: HTMLVideoElement | null): boolean {
  if (videoEl == null && typeof document === "undefined") return false;
  const video = videoEl ?? document.createElement("video");
  if (typeof video.canPlayType !== "function") return false;
  const probe = (codec: string) => video.canPlayType(`video/mp4; codecs="${codec}"`);
  const hev1 = probe("hev1.1.6.L120.90");
  const hvc1 = probe("hvc1.1.6.L120.90");
  if (hev1 === "probably" || hvc1 === "probably") return true;
  if (hev1 === "maybe" || hvc1 === "maybe") return true;
  // Safari hint: HEVC-capable Safari reports the short form when it refuses the
  // fully-qualified profile string.
  if (typeof navigator !== "undefined") {
    const ua = navigator.userAgent;
    const isSafari = /Safari\//.test(ua) && !/Chrome\//.test(ua) && !/Chromium/.test(ua);
    if (isSafari && (probe("hev1") !== "" || probe("hvc1") !== "")) return true;
  }
  return false;
}

/**
 * Decide how a manifest should be played:
 *  - HEVC-only + unsupported browser → server-side transcode (HLS)
 *  - HEVC-only + supported browser   → play the DASH stream as-is
 *  - mixed HEVC+AVC                  → strip HEVC reps, play remaining AVC
 *  - otherwise                       → plain DASH
 */
export function pickPlayableManifest(
  text: string,
  videoEl?: HTMLVideoElement | null,
): ManifestDecision {
  const sniff = sniffManifest(text);
  const hevc = sniff.videoCodecs.includes("hevc");
  if (hevc && sniff.hevcOnly) {
    if (!browserSupportsHevc(videoEl)) return { mode: "transcode", hevcOnly: true };
    return { mode: "dash", text, stripped: false, hevcOnly: true };
  }
  if (hevc && sniff.hasAvc) {
    const stripped = stripHevcManifest(text);
    if (stripped.removed > 0) {
      return { mode: "dash", text: stripped.text, stripped: true, hevcOnly: false };
    }
  }
  return { mode: "dash", text, stripped: false, hevcOnly: false };
}

/**
 * Rewrite relative segment references inside a manifest so it can be played
 * from a Blob URL. `baseDir` is the absolute directory of the original source
 * (e.g. `https://host/api/proxy/{ticket}/a/dash/xxx/`); every relative
 * SegmentTemplate `init-stream$…`/`chunk-stream$…` reference and every
 * relative `<BaseURL>` is prefixed with it. Absolute URLs and already-rewritten
 * references are left alone.
 */
export function rewriteRelativeTo(baseDir: string, text: string): string {
  if (!baseDir) return text;
  // Segment-template media/initialization attributes whose value is a bare
  // relative path (optionally with a leading directory, e.g. "dash/xxx/init-stream$…").
  let out = text.replace(
    /(<(?:SegmentTemplate|SegmentList)\b[^>]*?\b(?:media|initialization)\s*=\s*["'])([^"']*)(["'])/gi,
    (whole, pre: string, val: string, post: string) => {
      if (
        val.startsWith("http://") ||
        val.startsWith("https://") ||
        val.startsWith("//") ||
        val.startsWith("/") ||
        val.startsWith(baseDir)
      ) {
        return whole;
      }
      return pre + baseDir + val + post;
    },
  );
  // Bare init/chunk tokens that were not covered above (defensive catch-all).
  out = out.replace(/(["'\s>])(init-stream\$|chunk-stream\$)/gi, (whole, pre: string, token: string) => {
    if (whole.startsWith(baseDir)) return whole; // impossible; guard only
    return pre + baseDir + token;
  });
  // Relative <BaseURL>text</BaseURL> contents.
  out = out.replace(/<BaseURL\b[^>]*>([\s\S]*?)<\/BaseURL>/gi, (whole, inner: string) => {
    const trimmed = inner.trim();
    if (
      !trimmed ||
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://") ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("/") ||
      trimmed.startsWith(baseDir)
    ) {
      return whole;
    }
    return whole.replace(inner, baseDir + trimmed);
  });
  return out;
}
