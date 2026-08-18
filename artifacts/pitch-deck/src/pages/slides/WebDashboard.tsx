export default function WebDashboard() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-text font-display">
      <div className="absolute -top-[20vh] -left-[10vw] w-[45vw] h-[45vw] rounded-full bg-accent/10 blur-[120px]" />

      <div className="relative h-full grid grid-cols-[0.9fr_1.1fr] gap-[4vw] px-[8vw] py-[11vh]">
        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-[1vw] font-mono text-accent text-[2.2vw] tracking-[0.25em]">
            <span className="inline-block w-[1.2vw] h-[1.2vw] bg-accent" />
            WEB DASHBOARD
          </div>
          <h2 className="mt-[3vh] text-[5.4vw] leading-[0.95] font-extrabold tracking-tight [text-wrap:balance]">
            Mission control on the web
          </h2>
          <div className="mt-[4vh] flex flex-col gap-[2.6vh]">
            <div className="flex items-start gap-[1.2vw]">
              <span className="mt-[1vh] inline-block w-[1.1vw] h-[1.1vw] shrink-0 bg-accent" />
              <span className="text-[2.4vw] leading-snug text-text/85">
                Success rate, runs, and active deploys at a glance.
              </span>
            </div>
            <div className="flex items-start gap-[1.2vw]">
              <span className="mt-[1vh] inline-block w-[1.1vw] h-[1.1vw] shrink-0 bg-accent" />
              <span className="text-[2.4vw] leading-snug text-text/85">
                Searchable run history with stage-by-stage status.
              </span>
            </div>
            <div className="flex items-start gap-[1.2vw]">
              <span className="mt-[1vh] inline-block w-[1.1vw] h-[1.1vw] shrink-0 bg-accent" />
              <span className="text-[2.4vw] leading-snug text-text/85">
                Live log streaming over WebSockets.
              </span>
            </div>
            <div className="flex items-start gap-[1.2vw]">
              <span className="mt-[1vh] inline-block w-[1.1vw] h-[1.1vw] shrink-0 bg-accent" />
              <span className="text-[2.4vw] leading-snug text-text/85">
                Manual launch from any saved config.
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center">
          <div className="rounded-[1.2vw] bg-panel border border-line p-[1.8vw]">
            <div className="flex items-center gap-[0.8vw] font-mono text-[1.4vw] text-muted">
              <span className="inline-block w-[1vw] h-[1vw] rounded-full bg-accent" />
              shipkit · pipeline control
            </div>
            <div className="mt-[2vh] grid grid-cols-3 gap-[1vw]">
              <div className="rounded-[0.7vw] bg-bg border border-line px-[1vw] py-[1.6vh]">
                <div className="font-mono text-[1.2vw] text-muted">SUCCESS</div>
                <div className="text-[3vw] font-extrabold text-accent">98%</div>
              </div>
              <div className="rounded-[0.7vw] bg-bg border border-line px-[1vw] py-[1.6vh]">
                <div className="font-mono text-[1.2vw] text-muted">RUNS</div>
                <div className="text-[3vw] font-extrabold">1,204</div>
              </div>
              <div className="rounded-[0.7vw] bg-bg border border-line px-[1vw] py-[1.6vh]">
                <div className="font-mono text-[1.2vw] text-muted">ACTIVE</div>
                <div className="text-[3vw] font-extrabold">3</div>
              </div>
            </div>
            <div className="mt-[2vh] flex flex-col gap-[1vh]">
              <div className="flex items-center justify-between rounded-[0.7vw] bg-bg border border-line px-[1.2vw] py-[1.5vh]">
                <span className="font-mono text-[1.5vw] text-text/80">run #1204 · main</span>
                <span className="font-mono text-[1.4vw] text-accent">SUBMIT</span>
              </div>
              <div className="flex items-center justify-between rounded-[0.7vw] bg-bg border border-line px-[1.2vw] py-[1.5vh]">
                <span className="font-mono text-[1.5vw] text-text/80">run #1203 · main</span>
                <span className="font-mono text-[1.4vw] text-text/60">BUILD</span>
              </div>
              <div className="flex items-center justify-between rounded-[0.7vw] bg-bg border border-line px-[1.2vw] py-[1.5vh]">
                <span className="font-mono text-[1.5vw] text-text/80">run #1202 · release</span>
                <span className="font-mono text-[1.4vw] text-text/60">SYNC</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-[5vh] right-[8vw] font-mono text-[2.2vw] text-muted">
        05 / 07
      </div>
    </div>
  );
}
