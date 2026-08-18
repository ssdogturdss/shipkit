import { Shell } from "@/components/layout/Shell";
import { useGetPipelineStats, useListPipelineConfigs, useTriggerPipelineRun, getListPipelineRunsQueryKey, useGetPipelineRun, getGetPipelineStatsQueryKey, getGetPipelineRunQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, CheckCircle, XCircle, Clock, Rocket, RefreshCw, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const { data: stats, isLoading: isStatsLoading } = useGetPipelineStats({
    query: { queryKey: getGetPipelineStatsQueryKey(), refetchInterval: 5000 }
  });
  
  const { data: configs } = useListPipelineConfigs();
  const triggerRun = useTriggerPipelineRun();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedConfigId, setSelectedConfigId] = useState<string>("");

  const requestNotificationPermission = () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  };

  const handleRunPipeline = () => {
    if (!selectedConfigId) return;
    requestNotificationPermission();
    triggerRun.mutate({ data: { configId: parseInt(selectedConfigId) } }, {
      onSuccess: () => {
        toast({ title: "Pipeline triggered successfully" });
        queryClient.invalidateQueries({ queryKey: getListPipelineRunsQueryKey() });
      },
      onError: () => {
        toast({ title: "Failed to trigger pipeline", variant: "destructive" });
      }
    });
  };

  const activeRunId = stats?.recentRuns?.find(r => r.status === 'running' || r.status === 'pending')?.id;
  
  const { data: activeRun } = useGetPipelineRun(activeRunId || 0, {
    query: {
      queryKey: getGetPipelineRunQueryKey(activeRunId || 0),
      enabled: !!activeRunId,
      refetchInterval: 3000
    }
  });

  // Fire a browser notification when a tracked run reaches a terminal state.
  const trackedRunRef = useRef<{ id: number; status: string } | null>(null);
  useEffect(() => {
    if (!activeRun) return;
    const prev = trackedRunRef.current;
    const isTerminal = activeRun.status === "success" || activeRun.status === "failed";
    if (
      prev &&
      prev.id === activeRun.id &&
      prev.status !== activeRun.status &&
      isTerminal &&
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      const ok = activeRun.status === "success";
      new Notification(ok ? "Pipeline succeeded ✅" : "Pipeline failed ❌", {
        body: `${activeRun.configName} — run #${activeRun.id} ${ok ? "completed successfully" : "failed"}`,
        tag: `shipkit-run-${activeRun.id}`,
      });
    }
    trackedRunRef.current = { id: activeRun.id, status: activeRun.status };
  }, [activeRun?.id, activeRun?.status]);

  return (
    <Shell>
      <div className="p-8 max-w-6xl mx-auto space-y-8">
        <header className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-mono font-bold tracking-tight">System Overview</h1>
            <p className="text-muted-foreground mt-2">Live monitoring of deployment pipelines.</p>
          </div>
          <div className="flex items-center gap-4 bg-card p-2 rounded-lg border border-border shadow-sm">
            <Select value={selectedConfigId} onValueChange={setSelectedConfigId}>
              <SelectTrigger className="w-[200px] border-border bg-background font-mono text-sm">
                <SelectValue placeholder="Select Config" />
              </SelectTrigger>
              <SelectContent>
                {configs?.map(c => (
                  <SelectItem key={c.id} value={c.id.toString()} className="font-mono text-sm">{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleRunPipeline} disabled={!selectedConfigId || triggerRun.isPending} className="font-mono font-bold tracking-wider gap-2">
              <Rocket size={16} /> LAUNCH
            </Button>
          </div>
        </header>

        {activeRun && (
          <div className="border border-primary/50 bg-primary/5 rounded-lg p-6 relative overflow-hidden shadow-[0_0_30px_rgba(0,255,255,0.05)]">
            <div className="absolute top-0 left-0 w-full h-1 bg-primary/20">
              <div className="h-full bg-primary animate-pulse-fast w-1/3"></div>
            </div>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-primary animate-pulse"></div>
                <h2 className="text-xl font-mono font-bold text-primary">ACTIVE MISSION</h2>
                <Badge variant="outline" className="font-mono border-primary/50 text-primary uppercase">{activeRun.configName}</Badge>
              </div>
              <Link href={`/runs/${activeRun.id}`} className="text-sm font-mono text-primary hover:underline flex items-center gap-1">
                Monitor <ChevronRight size={14} />
              </Link>
            </div>
            
            <div className="grid grid-cols-3 gap-6">
              {['sync', 'build', 'submit'].map((stageName) => {
                const stage = activeRun.stages?.find(s => s.stageName === stageName);
                const status = stage?.status || 'pending';
                const isRunning = status === 'running';
                
                return (
                  <div key={stageName} className={`p-4 rounded border ${isRunning ? 'border-primary bg-primary/10' : 'border-border/50 bg-black/20'} flex flex-col gap-2`}>
                    <div className="flex items-center justify-between">
                      <span className="font-mono uppercase tracking-widest text-sm font-bold opacity-80">{stageName}</span>
                      {status === 'success' && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                      {status === 'running' && <RefreshCw className="w-4 h-4 text-primary animate-spin" />}
                      {status === 'pending' && <Clock className="w-4 h-4 text-muted-foreground" />}
                      {status === 'failed' && <XCircle className="w-4 h-4 text-destructive" />}
                    </div>
                    <div className={`font-mono text-xs uppercase ${isRunning ? 'text-primary' : 'text-muted-foreground'}`}>
                      {status}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isStatsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : stats ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-6 rounded-lg border border-border bg-card shadow-sm relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
              <div className="flex items-center gap-3 text-muted-foreground mb-4">
                <Activity size={18} />
                <span className="text-sm font-mono font-medium uppercase tracking-wider">Total Runs</span>
              </div>
              <div className="text-5xl font-mono font-bold text-foreground">{stats.totalRuns}</div>
            </div>
            
            <div className="p-6 rounded-lg border border-border bg-card shadow-sm relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
              <div className="flex items-center gap-3 text-emerald-500 mb-4">
                <CheckCircle size={18} />
                <span className="text-sm font-mono font-medium uppercase tracking-wider text-muted-foreground">Success Rate</span>
              </div>
              <div className="text-5xl font-mono font-bold text-emerald-500">{stats.successRate.toFixed(1)}%</div>
            </div>

            <div className="p-6 rounded-lg border border-border bg-card shadow-sm relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-destructive/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
              <div className="flex items-center gap-3 text-destructive mb-4">
                <XCircle size={18} />
                <span className="text-sm font-mono font-medium uppercase tracking-wider text-muted-foreground">Failed</span>
              </div>
              <div className="text-5xl font-mono font-bold text-destructive">{stats.failedRuns}</div>
            </div>

            <div className="p-6 rounded-lg border border-border bg-card shadow-sm relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
              <div className="flex items-center gap-3 text-primary mb-4">
                <Clock size={18} />
                <span className="text-sm font-mono font-medium uppercase tracking-wider text-muted-foreground">Running</span>
              </div>
              <div className="text-5xl font-mono font-bold text-primary">{stats.runningRuns}</div>
            </div>
          </div>
        ) : null}

      </div>
    </Shell>
  );
}
