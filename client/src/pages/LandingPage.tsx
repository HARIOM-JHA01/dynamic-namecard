import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, Mail, Play, Volume2, VolumeX } from "lucide-react";
import { fetchLanding, FALLBACK_VIDEO, DEFAULT_BUTTONS } from "../api";

/** Faint decorative dot grid. */
const DotGrid: React.FC<{ className?: string }> = ({ className }) => (
  <div
    aria-hidden
    className={className}
    style={{
      backgroundImage: "radial-gradient(#2f6bff 1.4px, transparent 1.4px)",
      backgroundSize: "14px 14px",
      opacity: 0.18,
    }}
  />
);

// Deterministic bubble field — varied size, position, speed and drift.
const BUBBLES = [
  { left: "8%", size: 26, dur: 15, delay: 0, drift: "24px" },
  { left: "20%", size: 14, dur: 11, delay: 3, drift: "-18px" },
  { left: "33%", size: 40, dur: 19, delay: 6, drift: "16px" },
  { left: "46%", size: 18, dur: 13, delay: 1.5, drift: "-28px" },
  { left: "58%", size: 30, dur: 17, delay: 8, drift: "20px" },
  { left: "70%", size: 12, dur: 10, delay: 4.5, drift: "-14px" },
  { left: "82%", size: 34, dur: 21, delay: 2, drift: "26px" },
  { left: "90%", size: 20, dur: 14, delay: 7, drift: "-22px" },
  { left: "15%", size: 22, dur: 16, delay: 9.5, drift: "18px" },
  { left: "64%", size: 16, dur: 12, delay: 11, drift: "-16px" },
];

const BubbleField: React.FC = () => (
  <div
    aria-hidden
    className="pointer-events-none absolute inset-0 z-0 overflow-hidden motion-reduce:hidden"
  >
    {BUBBLES.map((b, i) => (
      <span
        key={i}
        className="absolute bottom-[-60px] rounded-full animate-bubble-rise"
        style={{
          left: b.left,
          width: b.size,
          height: b.size,
          animationDuration: `${b.dur}s`,
          animationDelay: `${b.delay}s`,
          ["--bubble-drift" as string]: b.drift,
          background:
            "radial-gradient(circle at 30% 26%, rgba(255,255,255,0.95), rgba(96,150,255,0.85) 42%, rgba(37,90,224,0.7) 100%)",
          boxShadow: "0 6px 18px rgba(47,107,255,0.35), inset 0 0 6px rgba(255,255,255,0.5)",
        }}
      />
    ))}
  </div>
);

const Waves: React.FC = () => (
  <div
    aria-hidden
    className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-48 overflow-hidden"
  >
    {[
      { fill: "rgba(156,194,255,0.45)", dur: "14s", h: "h-40" },
      { fill: "rgba(96,150,255,0.40)", dur: "10s", h: "h-32" },
      { fill: "rgba(47,107,255,0.35)", dur: "7s", h: "h-24" },
    ].map((w, i) => (
      <svg
        key={i}
        className={`absolute bottom-0 left-0 w-[200%] animate-wave-shift ${w.h} motion-reduce:animate-none`}
        style={{ animationDuration: w.dur }}
        viewBox="0 0 1440 160"
        preserveAspectRatio="none"
      >
        <path
          fill={w.fill}
          d="M0,64 C180,120 360,20 720,64 C1080,108 1260,20 1440,64 L1440,160 L0,160 Z"
        />
      </svg>
    ))}
  </div>
);

const LandingPage: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [needsTap, setNeedsTap] = useState(false);
  const userChoseRef = useRef(false);
  // Video + its own link (opened when the video ends)…
  const [videoSrc, setVideoSrc] = useState(FALLBACK_VIDEO.videoUrl);
  const [videoLink, setVideoLink] = useState(FALLBACK_VIDEO.linkUrl);
  // …and, separately, the site-wide button targets.
  const [createLink, setCreateLink] = useState(DEFAULT_BUTTONS.createLink);
  const [contactEmail, setContactEmail] = useState(DEFAULT_BUTTONS.contactEmail);

  const applyMuted = (next: boolean) => {
    setMuted(next);
    const v = videoRef.current;
    if (!v) return;
    v.muted = next;
    v.play().catch(() => {
      // Unmuting was rejected: fall back to muted so playback continues.
      if (!next) {
        v.muted = true;
        setMuted(true);
        v.play().catch(() => {});
      }
    });
  };

  const toggleMuted = () => {
    userChoseRef.current = true;
    applyMuted(!muted);
  };

  // Set muted imperatively before play() so iOS Safari allows autoplay.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.play().then(() => setNeedsTap(false)).catch(() => setNeedsTap(true));
  }, []);

  // Load the active video + links; falls back to defaults on failure.
  useEffect(() => {
    fetchLanding().then(({ video, buttons }) => {
      setVideoSrc(video.videoUrl);
      setVideoLink(video.linkUrl);
      setCreateLink(buttons.createLink);
      setContactEmail(buttons.contactEmail);
    });
  }, []);

  const handleTapToPlay = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.play().then(() => setNeedsTap(false)).catch(() => {});
  };

  // Unmute on first genuine gesture only (not scroll/touchstart — those pause
  // the video on iOS Safari).
  useEffect(() => {
    const events: (keyof DocumentEventMap)[] = ["pointerdown", "keydown"];
    const cleanup = () => events.forEach((e) => document.removeEventListener(e, onFirst));
    const onFirst = () => {
      if (!userChoseRef.current) applyMuted(false);
      cleanup();
    };
    events.forEach((e) => document.addEventListener(e, onFirst, { passive: true }));
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToCreate = () => window.open(createLink, "_blank", "noopener,noreferrer");
  // The video's own link; nothing happens when a video has none.
  const onVideoEnded = () => {
    if (videoLink) window.open(videoLink, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className="relative flex min-h-screen w-full flex-col items-center overflow-hidden"
      style={{ background: "linear-gradient(180deg, #eaf4ff 0%, #dcecfb 55%, #cfe4f9 100%)" }}
    >
      <Waves />
      <BubbleField />
      <DotGrid className="pointer-events-none absolute right-4 top-24 z-0 h-20 w-24" />
      <DotGrid className="pointer-events-none absolute right-6 top-1/2 z-0 h-24 w-24" />

      <div className="relative z-10 flex w-full max-w-[440px] flex-1 flex-col px-6 pb-4 pt-4">
        <div
          className="mx-auto mb-3 mt-2 w-[85%] animate-fade-slide-up text-left"
          style={{ animationDelay: "80ms" }}
        >
          <h1 className="text-center text-2xl font-bold leading-snug text-[#3a4363]">
            <span className="whitespace-nowrap">Upgrade Your Namecard to</span>
            <br />
            <span className="whitespace-nowrap">
              Dynamic is <span className="font-semibold text-[#2f6bff]">Free Forever</span>
            </span>
          </h1>
        </div>

        <div className="flex justify-center" style={{ marginTop: 10 }}>
          <div
            className="relative mx-auto w-[85%] animate-fade-slide-up"
            style={{ animationDelay: "240ms" }}
          >
            <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl">
              <video
                ref={videoRef}
                key={videoSrc}
                className="h-full w-full object-contain"
                src={videoSrc}
                poster="/welcome-video-poster.jpg"
                autoPlay
                muted
                playsInline
                onEnded={onVideoEnded}
              />
              {needsTap && (
                <button
                  type="button"
                  onClick={handleTapToPlay}
                  aria-label="Play video"
                  className="absolute inset-0 flex items-center justify-center bg-black/30"
                >
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-[#2f6bff] shadow-lg">
                    <Play size={28} className="ml-1" fill="currentColor" />
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={toggleMuted}
                aria-label={muted ? "Unmute video" : "Mute video"}
                className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70 active:scale-95"
              >
                {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
            </div>
          </div>
        </div>

        <div
          className="mt-1 flex animate-fade-slide-up items-end gap-2 pl-2"
          style={{ animationDelay: "320ms" }}
        >
          <svg width="34" height="40" viewBox="0 0 34 40" fill="none" aria-hidden className="mb-1 text-[#2f6bff]">
            <path
              d="M4 4c-1 12 3 22 14 27M18 31l-8 2M18 31l2-8"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="text-lg font-medium text-[#4a5578]">
            We&apos;ll direct you to <span className="font-semibold text-[#2f6bff]">Create One</span>
          </p>
        </div>

        <button
          onClick={goToCreate}
          style={{ animationDelay: "400ms" }}
          className="mx-auto mt-3 flex w-[85%] animate-fade-slide-up items-center justify-center gap-2 rounded-2xl bg-[#2f6bff] py-4 text-center text-lg font-semibold text-white shadow-lg transition hover:bg-[#245ae0] hover:shadow-xl active:scale-[0.98]"
        >
          Go to Create One
          <ArrowRight size={20} />
        </button>

        <a
          href={`mailto:${contactEmail}`}
          style={{ animationDelay: "480ms" }}
          className="mx-auto mt-3 flex w-[85%] animate-fade-slide-up items-center justify-center gap-2 rounded-2xl border-2 border-[#2f6bff] bg-white/80 py-3.5 text-center text-lg font-semibold text-[#2f6bff] shadow-md backdrop-blur transition hover:bg-white active:scale-[0.98]"
        >
          <Mail size={20} />
          Contact us
        </a>
      </div>
    </div>
  );
};

export default LandingPage;
