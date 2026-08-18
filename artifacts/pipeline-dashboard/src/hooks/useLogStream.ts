import { useState, useEffect, useRef } from "react";

export interface StreamLog {
  id: number;
  runId: number;
  stage: string | null;
  level: "info" | "warn" | "error" | "success";
  message: string;
  createdAt: string;
}

export interface UseLogStreamResult {
  logs: StreamLog[];
  isDone: boolean;
  finalStatus: string | null;
  error: boolean;
}

/**
 * Streams run logs from the SSE endpoint.
 * Falls back gracefully: if EventSource is unavailable or stream errors, sets error=true
 * so the caller can fall back to polling via useListRunLogs.
 */
export function useLogStream(runId: number, enabled: boolean): UseLogStreamResult {
  const [logs, setLogs] = useState<StreamLog[]>([]);
  const [isDone, setIsDone] = useState(false);
  const [finalStatus, setFinalStatus] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const seenIds = useRef(new Set<number>());

  useEffect(() => {
    if (!enabled || !runId) return;

    // Reset state on each new stream
    setLogs([]);
    setIsDone(false);
    setFinalStatus(null);
    setError(false);
    seenIds.current.clear();

    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    const url = `${base}/api/pipeline-runs/${runId}/logs/stream`;

    let es: EventSource;
    try {
      es = new EventSource(url);
    } catch {
      setError(true);
      return;
    }

    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as StreamLog & { type?: string; status?: string };
        if (data.type === "done") {
          setIsDone(true);
          setFinalStatus(data.status ?? null);
          es.close();
          return;
        }
        if (data.id && !seenIds.current.has(data.id)) {
          seenIds.current.add(data.id);
          setLogs((prev) => [...prev, data as StreamLog]);
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      // SSE connection dropped — mark error so caller can fall back to polling
      setError(true);
      es.close();
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [runId, enabled]);

  return { logs, isDone, finalStatus, error };
}
