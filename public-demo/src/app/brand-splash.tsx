

import {useEffect, useState} from "react";

export default function BrandSplash({children}: {children: React.ReactNode}) {
  const [phase, setPhase] = useState<"starting" | "playing" | "done">("starting");

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches || new URLSearchParams(window.location.search).has("case")) {
      setPhase("done");
      return;
    }

    setPhase("playing");
    const timeout = window.setTimeout(() => setPhase("done"), 9000);
    return () => window.clearTimeout(timeout);
  }, []);

  if (phase === "done") return children;

  return (
    <main className="launch-splash" aria-label="Nalbace startup">
      {phase === "playing" ? (
        <video
          src="/brand-motion/nalbace-light.mp4"
          poster="/brand-motion/nalbace-light.jpg"
          autoPlay
          muted
          playsInline
          onLoadedMetadata={event => {
            const video = event.currentTarget;
            if (Number.isFinite(video.duration)) video.currentTime = Math.max(0, video.duration - 5);
          }}
          onEnded={() => setPhase("done")}
          onError={() => setPhase("done")}
          aria-hidden="true"
        />
      ) : (
        <img src="/brand-motion/nalbace-light.jpg" alt="" />
      )}
      <button type="button" onClick={() => setPhase("done")}>Skip intro</button>
    </main>
  );
}
