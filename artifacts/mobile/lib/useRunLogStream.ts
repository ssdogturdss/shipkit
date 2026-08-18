import { fetch as expoFetch } from "expo/fetch";
import { useEffect, useRef, useState } from "react";
import { getStreamRunLogsUrl, type RunLog } from "@workspace/api-client-react";

const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN;

export interface RunLogStream {
  logs: RunLog[];
  connected: boolean;
  done: boolean;
  doneStatus: string | null;
  error: string | null;
}

/**
 * Subscribes to the server's SSE log stream for a run using expo/fetch (which
 * supports getReader() on iOS, Android, and web). The endpoint replays existing
 * logs first, then streams new lines, then emits a terminal `{type:"done"}`
 * frame when the run reaches a final state.
 */
export function useRunLogStream(runId: number | null): RunLogStream {
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [connected, setConnected] = useState(false);
  const [done, setDone] = useState(false);
  const [doneStatus, setDoneStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seen = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!runId || !DOMAIN) return;

    let cancelled = false;
    const controller = new AbortController();

    seen.current = new Set();
    setLogs([]);
    setConnected(false);
    setDone(false);
    setDoneStatus(null);
    setError(null);

    (async () => {
      try {
        const url = `https://${DOMAIN}${getStreamRunLogsUrl(runId)}`;
        const res = await expoFetch(url, {
          headers: { Accept: "text/event-stream" },
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`Log stream failed (${res.status})`);
        }
        if (!cancelled) setConnected(true);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done: streamDone, value } = await reader.read();
          if (streamDone) break;

          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const dataLine = frame
              .split("\n")
              .find((l) => l.startsWith("data:"));
            if (!dataLine) continue;
            const raw = dataLine.slice(5).trim();
            if (!raw) continue;

            let parsed: unknown;
            try {
              parsed = JSON.parse(raw);
            } catch {
              continue;
            }

            const obj = parsed as Record<string, unknown>;
            if (obj.type === "done") {
              if (!cancelled) {
                setDone(true);
                setDoneStatus(
                  typeof obj.status === "string" ? obj.status : null,
                );
              }
              continue;
            }

            const log = parsed as RunLog;
            if (typeof log.id !== "number" || seen.current.has(log.id)) continue;
            seen.current.add(log.id);
            if (!cancelled) setLogs((prev) => [...prev, log]);
          }
        }
        if (!cancelled) setConnected(false);
      } catch (e) {
        const err = e as { name?: string; message?: string };
        if (!cancelled && err?.name !== "AbortError") {
          setError(err?.message ?? "Failed to stream logs");
          setConnected(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [runId]);

  return { logs, connected, done, doneStatus, error };
}
