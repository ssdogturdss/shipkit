import { Shell } from "@/components/layout/Shell";
import { useListPipelineRuns } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Link } from "wouter";
import { CheckCircle2, Clock, XCircle, AlertCircle, RefreshCw, Github, Hand } from "lucide-react";

export default function Runs() {
  const { data: runs, isLoading } = useListPipelineRuns();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success": return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case "failed": return <XCircle className="w-4 h-4 text-destructive" />;
      case "running": return <RefreshCw className="w-4 h-4 text-primary animate-spin" />;
      case "pending": return <Clock className="w-4 h-4 text-muted-foreground" />;
      case "cancelled": return <AlertCircle className="w-4 h-4 text-orange-500" />;
      default: return null;
    }
  };

  return (
    <Shell>
      <div className="p-8 max-w-6xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-mono font-bold tracking-tight">Run History</h1>
          <p className="text-muted-foreground mt-2">All past deployment pipeline runs.</p>
        </header>

        <div className="border border-border rounded-md bg-card">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Run ID</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Config</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Status</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Stage</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Trigger</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Started</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-muted-foreground text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-border">
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : runs?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    No runs found.
                  </TableCell>
                </TableRow>
              ) : runs?.map((run) => (
                <TableRow key={run.id} className="border-border hover:bg-muted/50 transition-colors">
                  <TableCell className="font-mono">#{run.id}</TableCell>
                  <TableCell className="font-medium">{run.configName}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(run.status)}
                      <span className="capitalize text-sm">{run.status}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="uppercase tracking-wider text-[10px] font-mono border-border">
                      {run.currentStage || "Not Started"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {run.triggeredBy === "push" ? (
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <Github className="w-3.5 h-3.5 text-muted-foreground" />
                        GitHub push
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <Hand className="w-3.5 h-3.5 text-muted-foreground" />
                        Manual
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {run.startedAt ? format(new Date(run.startedAt), "MMM d, HH:mm") : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/runs/${run.id}`} className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-3">
                      View
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </Shell>
  );
}
