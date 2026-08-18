import { Shell } from "@/components/layout/Shell";
import {
  useGetPipelineRun,
  useListRunLogs,
  getGetPipelineRunQueryKey,
  getListRunLogsQueryKey,
  useRetryPipelineStage,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Clock, XCircle, RefreshCw, ExternalLink, RotateCcw } from "lucide-react";
import { useEffect, useRef, useMemo } from "react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useLogStream, type StreamLog } from "@/hooks/useLogStream";

type StageName = "sync" | "build" | "submit";

const STAGE_LABELS: Record<StageName, string> = {
  sync: "Code Sync",
  build: "EAS Build",
  submit: "App Store Submit",
};

export default function RunDetail() {
  const { id } = useParams();
  const runId = parseInt(id || "0", 10);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const retryMutation = useRetryPipelineStage();

  const isActive = (status?: string) => status === "running" || status === "pending";

  const { data: run, isLoading: isRunLoading } = useGetPipelineRun(runId, {
    query: {
      enabled: !!runId,
      queryKey: getGetPipelineRunQueryKey(runId),
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return isActive(status) ? 3000 : false;
      },
    },
  });

  // SSE stream — active when run is in-progress
  const streamActive = !!runId && isActive(run?.status ?? "pending");
  const { logs: streamLogs, isDone: streamDone, error: streamError } = useLogStream(runId, streamActive || run === undefined);

  // Polling fallback — used when stream errored or run is terminal
  const usePollFallback = streamError || (!streamActive && !streamDone);
  const { data: polledLogs, isLoading: isLogsLoading } = useListRunLogs(runId, {
    query: {
      queryKey: getListRunLogsQueryKey(runId),
      enabled: !!runId && usePollFallback,
      refetchInterval: () => isActive(run?.status) ? 2000 : false,
    },
  });

  // Merge: prefer stream logs when active, otherwise use polled data
  const logs: StreamLog[] = useMemo(() => {
    if (!usePollFallback && streamLogs.length > 0) return streamLogs;
    return (polledLogs ?? []).map((l) => ({
      id: l.id,
      runId: l.runId,
      stage: l.stage ?? null,
      level: l.level as StreamLog["level"],
      message: l.message,
      createdAt: l.createdAt,
    }));
  }, [usePollFallback, streamLogs, polledLogs]);

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const handleRetry = (stageName: StageName) => {
    retryMutation.mutate(
      { id: runId, stage: stageName },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetPipelineRunQueryKey(runId) });
          toast({ title: "Stage retry triggered", description: `Retrying from ${STAGE_LABELS[stageName]}` });
        },
        onError: () => {
          toast({ title: "Retry failed", description: "Could not retry the stage.", variant: "destructive" });
        },
      },
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success": return "text-emerald-500";
      case "failed": return "text-destructive";
      case "running": return "text-primary animate-pulse";
      case "skipped": return "text-muted-foreground/40";
      default: return "text-muted-foreground";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success": return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
      case "failed": return <XCircle className="w-5 h-5 text-destructive" />;
      case "running": return <RefreshCw className="w-5 h-5 text-primary animate-spin" />;
      case "skipped": return <Clock className="w-5 h-5 text-muted-foreground/40" />;
      default: return <Clock className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const canRetryFrom = (stageName: StageName) => {
    if (!run) return false;
    if (isActive(run.status)) return false;
    const stage = run.stages?.find((s) => s.stageName === stageName);
    return stage?.status === "failed" || stage?.status === "skipped";
  };

  const liveIndicator = streamActive && !streamError;

  if (!id) return null;

  return (
    <Shell>
      <div className="p-8 max-w-6xl mx-auto flex flex-col h-full overflow-hidden space-y-6">
        <header className="flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-mono font-bold tracking-tight" data-testid="text-run-id">
                Run #{runId}
              </h1>
              {run && (
                <Badge
                  variant="outline"
                  className={`capitalize font-mono uppercase tracking-wider ${getStatusColor(run.status)} border-current`}
                  data-testid="status-run-badge"
                >
                  {run.status}
                </Badge>
              )}
            </div>
            <div className="text-muted-foreground mt-2 font-mono text-sm">
              Config: {run?.configName ?? <Skeleton className="w-24 h-4 inline-block" />}
            </div>
          </div>
        </header>

        {isRunLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : run ? (
          <div className="grid grid-cols-3 gap-4 shrink-0">
            {run.stages?.map((stage) => {
              const sn = stage.stageName as StageName;
              const retryable = canRetryFrom(sn);
              return (
                <div
                  key={stage.id}
                  className="p-4 rounded-md border border-border bg-card flex flex-col gap-3 relative overflow-hidden"
                  data-testid={`card-stage-${sn}`}
                >
                  {stage.status === "running" && (
                    <div className="absolute bottom-0 left-0 h-1 bg-primary w-full animate-pulse" />
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-mono font-bold uppercase tracking-wider text-sm">
                      {getStatusIcon(stage.status)}
                      {sn}
                    </div>
                    {stage.externalUrl && (
                      <a
                        href={stage.externalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-primary transition-colors"
                        data-testid={`link-stage-external-${sn}`}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    Status: <span className={`capitalize ${getStatusColor(stage.status)}`}>{stage.status}</span>
                  </div>
                  {stage.startedAt && (
                    <div className="text-xs text-muted-foreground/60 font-mono">
                      Started: {format(new Date(stage.startedAt), "HH:mm:ss")}
                    </div>
                  )}
                  {retryable && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-auto font-mono text-xs gap-1.5"
                      disabled={retryMutation.isPending}
                      onClick={() => handleRetry(sn)}
                      data-testid={`button-retry-${sn}`}
                    >
                      <RotateCcw className="w-3 h-3" />
                      Retry from here
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="flex-1 min-h-0 bg-[#0A0A0B] rounded-md border border-border flex flex-col font-mono text-sm shadow-inner relative">
          <div className="p-3 border-b border-border/50 bg-black/40 flex items-center justify-between shrink-0">
            <span className="text-muted-foreground text-xs uppercase tracking-widest font-bold">
              Execution Logs
            </span>
            {liveIndicator && (
              <span className="flex items-center gap-2 text-xs text-primary" data-testid="status-live-indicator">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Live (SSE)
              </span>
            )}
            {streamError && isActive(run?.status) && (
              <span className="text-xs text-yellow-500">stream unavailable — polling</span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-1" data-testid="container-logs">
            {isLogsLoading && !logs.length ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-1/3 bg-white/5" />
                <Skeleton className="h-4 w-1/2 bg-white/5" />
                <Skeleton className="h-4 w-1/4 bg-white/5" />
              </div>
            ) : !logs.length ? (
              <div className="text-muted-foreground text-center py-8">No logs available yet.</div>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="flex gap-4 group hover:bg-white/[0.02] px-2 py-0.5 rounded -mx-2 transition-colors"
                  data-testid={`row-log-${log.id}`}
                >
                  <span className="text-muted-foreground/50 shrink-0 w-20 text-xs mt-0.5">
                    {format(new Date(log.createdAt), "HH:mm:ss")}
                  </span>
                  <span className="shrink-0 w-16">
                    {log.level === "info" && <span className="text-blue-400">INFO</span>}
                    {log.level === "success" && <span className="text-emerald-400">DONE</span>}
                    {log.level === "warn" && <span className="text-yellow-400">WARN</span>}
                    {log.level === "error" && <span className="text-red-400 font-bold">ERR!</span>}
                  </span>
                  <span className="shrink-0 w-24 text-muted-foreground/70 uppercase">
                    [{log.stage ?? "system"}]
                  </span>
                  <span className={`flex-1 break-words ${log.level === "error" ? "text-red-400" : "text-gray-300"}`}>
                    {log.message}
                  </span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>
    </Shell>
  );
}
