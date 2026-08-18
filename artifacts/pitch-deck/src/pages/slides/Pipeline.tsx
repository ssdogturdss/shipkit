export default function Pipeline() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-text font-display">
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(var(--slide-line) 1px, transparent 1px), linear-gradient(90deg, var(--slide-line) 1px, transparent 1px)",
          backgroundSize: "4vw 4vw",
        }}
      />

      <div className="relative h-full flex flex-col justify-center px-[8vw]">
        <div className="flex items-center gap-[1vw] font-mono text-accent text-[2.2vw] tracking-[0.25em]">
          <span className="inline-block w-[1.2vw] h-[1.2vw] bg-accent" />
          THE PIPELINE
        </div>
        <h2 className="mt-[3vh] text-[6vw] leading-[0.95] font-extrabold tracking-tight">
          Three stages, fully tracked
        </h2>

        <div className="mt-[7vh] grid grid-cols-[1fr_auto_1fr_auto_1fr] items-stretch gap-[1.2vw]">
          <div className="rounded-[1vw] bg-panel border border-line px-[1.8vw] py-[3vh]">
            <div className="font-mono text-accent text-[2.2vw] tracking-widest">01 · SYNC</div>
            <div className="mt-[1.5vh] text-[2.8vw] font-semibold">GitHub</div>
            <div className="mt-[1vh] text-[2.2vw] leading-snug text-muted">
              Pushes a sync commit to the target branch to mark a clean release.
            </div>
          </div>

          <div className="flex items-center justify-center font-mono text-accent text-[3vw]">→</div>

          <div className="rounded-[1vw] bg-panel border border-line px-[1.8vw] py-[3vh]">
            <div className="font-mono text-accent text-[2.2vw] tracking-widest">02 · BUILD</div>
            <div className="mt-[1.5vh] text-[2.8vw] font-semibold">EAS Build</div>
            <div className="mt-[1vh] text-[2.2vw] leading-snug text-muted">
              Triggers an iOS production build and polls Expo to completion.
            </div>
          </div>

          <div className="flex items-center justify-center font-mono text-accent text-[3vw]">→</div>

          <div className="rounded-[1vw] bg-panel border border-line px-[1.8vw] py-[3vh]">
            <div className="font-mono text-accent text-[2.2vw] tracking-widest">03 · SUBMIT</div>
            <div className="mt-[1.5vh] text-[2.8vw] font-semibold">TestFlight</div>
            <div className="mt-[1vh] text-[2.2vw] leading-snug text-muted">
              Signs an App Store Connect JWT and ships the build to testers.
            </div>
          </div>
        </div>

        <div className="mt-[5vh] font-mono text-[2.4vw] text-muted">
          <span className="text-accent">$</span> every stage streams logs as it runs
        </div>
      </div>

      <div className="absolute bottom-[5vh] right-[8vw] font-mono text-[2.2vw] text-muted">
        04 / 07
      </div>
    </div>
  );
}
