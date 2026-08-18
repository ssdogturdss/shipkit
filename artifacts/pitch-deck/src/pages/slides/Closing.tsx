export default function Closing() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-text font-display">
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(var(--slide-line) 1px, transparent 1px), linear-gradient(90deg, var(--slide-line) 1px, transparent 1px)",
          backgroundSize: "4vw 4vw",
        }}
      />
      <div className="absolute -bottom-[25vh] -right-[12vw] w-[55vw] h-[55vw] rounded-full bg-accent/15 blur-[130px]" />
      <div className="absolute bottom-0 left-0 h-[0.5vh] w-full bg-accent/40" />

      <div className="relative h-full flex flex-col justify-center px-[8vw]">
        <div className="flex items-center gap-[1.2vw] font-mono text-accent text-[2.2vw] tracking-[0.25em]">
          <span className="inline-block w-[1.4vw] h-[1.4vw] bg-accent" />
          FROM COMMIT TO TESTFLIGHT
        </div>

        <h2 className="mt-[3vh] text-[11vw] leading-[0.9] font-extrabold tracking-tighter">
          Ship<span className="text-accent">Kit</span>
        </h2>

        <p className="mt-[3vh] max-w-[58vw] text-[3vw] leading-snug text-text/85 [text-wrap:balance]">
          One pipeline for every React Native release — launched in a click,
          watched in real time, secured by default.
        </p>

        <div className="mt-[7vh] flex items-center gap-[2.5vw] font-mono text-[2.4vw] text-muted">
          <span className="text-text">shipkit.dev</span>
          <span className="text-accent">·</span>
          <span>GitHub → EAS → TestFlight</span>
        </div>
      </div>

      <div className="absolute bottom-[5vh] right-[8vw] font-mono text-[2.2vw] text-muted">
        07 / 07
      </div>
    </div>
  );
}
