export default function Title() {
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
      <div className="absolute -top-[20vh] -right-[15vw] w-[55vw] h-[55vw] rounded-full bg-accent/15 blur-[120px]" />
      <div className="absolute top-0 left-0 h-[0.5vh] w-full bg-accent/40" />

      <div className="relative h-full flex flex-col justify-center px-[8vw]">
        <div className="flex items-center gap-[1.2vw] font-mono text-accent text-[2.2vw] tracking-[0.25em]">
          <span className="inline-block w-[1.4vw] h-[1.4vw] bg-accent" />
          DEPLOYMENT ORCHESTRATION
        </div>

        <h1 className="mt-[3vh] text-[16vw] leading-[0.9] font-extrabold tracking-tighter">
          Ship<span className="text-accent">Kit</span>
        </h1>

        <p className="mt-[3vh] max-w-[60vw] text-[3vw] leading-snug text-text/85 [text-wrap:balance]">
          Automated CI/CD for React Native and Expo apps — from a GitHub push
          to TestFlight, in one visible pipeline.
        </p>

        <div className="mt-[6vh] flex items-center gap-[1.5vw] font-mono text-[2.4vw] text-muted">
          <span className="text-text">GitHub</span>
          <span className="text-accent">→</span>
          <span className="text-text">EAS Build</span>
          <span className="text-accent">→</span>
          <span className="text-text">TestFlight</span>
        </div>
      </div>

      <div className="absolute bottom-[5vh] right-[8vw] font-mono text-[2.2vw] text-muted">
        01 / 07
      </div>
    </div>
  );
}
