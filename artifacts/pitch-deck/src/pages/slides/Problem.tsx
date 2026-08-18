export default function Problem() {
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

      <div className="relative h-full grid grid-cols-2 gap-[5vw] px-[8vw] py-[11vh]">
        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-[1vw] font-mono text-accent text-[2.2vw] tracking-[0.25em]">
            <span className="inline-block w-[1.2vw] h-[1.2vw] bg-accent" />
            THE PROBLEM
          </div>
          <h2 className="mt-[3vh] text-[6vw] leading-[0.95] font-extrabold tracking-tight [text-wrap:balance]">
            Shipping mobile is still manual
          </h2>
          <p className="mt-[4vh] max-w-[34vw] text-[2.6vw] leading-snug text-muted">
            Getting a build from code to a tester means stitching three systems
            together by hand — every release.
          </p>
        </div>

        <div className="flex flex-col justify-center gap-[2.5vh]">
          <div className="rounded-[1vw] bg-panel border border-line px-[2.5vw] py-[2.6vh]">
            <div className="font-mono text-accent text-[2.2vw]">01</div>
            <div className="mt-[1vh] text-[2.7vw] font-semibold">Fragmented tooling</div>
            <div className="mt-[0.6vh] text-[2.4vw] leading-snug text-muted">
              Steps scattered across GitHub, EAS, and App Store Connect.
            </div>
          </div>
          <div className="rounded-[1vw] bg-panel border border-line px-[2.5vw] py-[2.6vh]">
            <div className="font-mono text-accent text-[2.2vw]">02</div>
            <div className="mt-[1vh] text-[2.7vw] font-semibold">No shared visibility</div>
            <div className="mt-[0.6vh] text-[2.4vw] leading-snug text-muted">
              Builds run in a terminal, so status lives on one laptop.
            </div>
          </div>
          <div className="rounded-[1vw] bg-panel border border-line px-[2.5vw] py-[2.6vh]">
            <div className="font-mono text-accent text-[2.2vw]">03</div>
            <div className="mt-[1vh] text-[2.7vw] font-semibold">Specialist knowledge</div>
            <div className="mt-[0.6vh] text-[2.4vw] leading-snug text-muted">
              EAS profiles and App Store credentials trip up most teams.
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-[5vh] right-[8vw] font-mono text-[2.2vw] text-muted">
        02 / 07
      </div>
    </div>
  );
}
