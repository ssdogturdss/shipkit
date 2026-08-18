export default function MobileApp() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-text font-display">
      <div className="absolute -bottom-[20vh] -right-[8vw] w-[45vw] h-[45vw] rounded-full bg-accent/10 blur-[120px]" />

      <div className="relative h-full grid grid-cols-[1.15fr_0.85fr] gap-[4vw] px-[8vw] py-[9vh]">
        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-[1vw] font-mono text-accent text-[2.2vw] tracking-[0.25em]">
            <span className="inline-block w-[1.2vw] h-[1.2vw] bg-accent" />
            MOBILE APP
          </div>
          <h2 className="mt-[3vh] text-[5.4vw] leading-[0.95] font-extrabold tracking-tight [text-wrap:balance]">
            Ship from anywhere
          </h2>
          <div className="mt-[4vh] flex flex-col gap-[2.6vh]">
            <div className="flex items-start gap-[1.2vw]">
              <span className="mt-[1vh] inline-block w-[1.1vw] h-[1.1vw] shrink-0 bg-accent" />
              <span className="text-[2.4vw] leading-snug text-text/85">
                Track deployment health from your phone.
              </span>
            </div>
            <div className="flex items-start gap-[1.2vw]">
              <span className="mt-[1vh] inline-block w-[1.1vw] h-[1.1vw] shrink-0 bg-accent" />
              <span className="text-[2.4vw] leading-snug text-text/85">
                Push notifications on success or failure.
              </span>
            </div>
            <div className="flex items-start gap-[1.2vw]">
              <span className="mt-[1vh] inline-block w-[1.1vw] h-[1.1vw] shrink-0 bg-accent" />
              <span className="text-[2.4vw] leading-snug text-text/85">
                Live logs streamed over server-sent events.
              </span>
            </div>
            <div className="flex items-start gap-[1.2vw]">
              <span className="mt-[1vh] inline-block w-[1.1vw] h-[1.1vw] shrink-0 bg-accent" />
              <span className="text-[2.4vw] leading-snug text-text/85">
                Overview and pipeline tabs for quick config.
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center">
          <div className="w-[20vw] h-[78vh] rounded-[2.5vw] bg-panel border-[0.4vw] border-line p-[1vw]">
            <div className="h-full rounded-[1.8vw] bg-bg border border-line p-[1.4vw] flex flex-col">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[1.2vw] text-muted">9:41</span>
                <span className="font-mono text-[1.2vw] text-accent">ShipKit</span>
              </div>
              <div className="mt-[2vh] text-[2vw] font-semibold">Overview</div>
              <div className="mt-[1.5vh] rounded-[1vw] bg-panel border border-line px-[1.2vw] py-[1.8vh]">
                <div className="font-mono text-[1.1vw] text-muted">LATEST RUN</div>
                <div className="mt-[0.6vh] text-[1.7vw] font-semibold">#1204 · main</div>
                <div className="mt-[0.6vh] font-mono text-[1.3vw] text-accent">SUBMIT · running</div>
              </div>
              <div className="mt-[1.4vh] grid grid-cols-2 gap-[0.8vw]">
                <div className="rounded-[0.9vw] bg-panel border border-line px-[1vw] py-[1.4vh]">
                  <div className="font-mono text-[1.1vw] text-muted">SUCCESS</div>
                  <div className="text-[2.4vw] font-extrabold text-accent">98%</div>
                </div>
                <div className="rounded-[0.9vw] bg-panel border border-line px-[1vw] py-[1.4vh]">
                  <div className="font-mono text-[1.1vw] text-muted">ACTIVE</div>
                  <div className="text-[2.4vw] font-extrabold">3</div>
                </div>
              </div>
              <div className="mt-auto flex items-center justify-between font-mono text-[1.2vw] text-muted pt-[1.5vh] border-t border-line">
                <span className="text-accent">Overview</span>
                <span>Pipelines</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-[5vh] right-[8vw] font-mono text-[2.2vw] text-muted">
        06 / 07
      </div>
    </div>
  );
}
