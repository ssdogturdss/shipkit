export default function Solution() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-text font-display">
      <div className="absolute -bottom-[25vh] -left-[10vw] w-[50vw] h-[50vw] rounded-full bg-accent/10 blur-[120px]" />
      <div className="absolute top-0 left-0 h-[0.5vh] w-full bg-accent/40" />

      <div className="relative h-full flex flex-col justify-center px-[8vw]">
        <div className="flex items-center gap-[1vw] font-mono text-accent text-[2.2vw] tracking-[0.25em]">
          <span className="inline-block w-[1.2vw] h-[1.2vw] bg-accent" />
          THE SOLUTION
        </div>
        <h2 className="mt-[3vh] max-w-[62vw] text-[6vw] leading-[0.95] font-extrabold tracking-tight [text-wrap:balance]">
          One pipeline, <span className="text-accent">end to end</span>
        </h2>
        <p className="mt-[3vh] max-w-[60vw] text-[2.6vw] leading-snug text-muted">
          ShipKit connects GitHub, EAS, and App Store Connect into a single
          orchestrated flow you launch and watch in real time.
        </p>

        <div className="mt-[6vh] grid grid-cols-3 gap-[2.5vw]">
          <div className="border-t border-line pt-[2.5vh]">
            <div className="text-[2.8vw] font-semibold">Unified flow</div>
            <div className="mt-[1.2vh] text-[2.2vw] leading-snug text-muted">
              One click, or an auto-deploy on every push to your branch.
            </div>
          </div>
          <div className="border-t border-accent pt-[2.5vh]">
            <div className="text-[2.8vw] font-semibold">Live monitoring</div>
            <div className="mt-[1.2vh] text-[2.2vw] leading-snug text-muted">
              Streamed logs and stage badges across web and mobile.
            </div>
          </div>
          <div className="border-t border-line pt-[2.5vh]">
            <div className="text-[2.8vw] font-semibold">Secure secrets</div>
            <div className="mt-[1.2vh] text-[2.2vw] leading-snug text-muted">
              Tokens and keys held in Replit Secrets, not the database.
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-[5vh] right-[8vw] font-mono text-[2.2vw] text-muted">
        03 / 07
      </div>
    </div>
  );
}
