import { Shell } from "@/components/layout/Shell";
import {
  useListPipelineConfigs,
  useCreatePipelineConfig,
  getListPipelineConfigsQueryKey,
  useGetGithubStatus,
  useListGithubRepos,
  useListGithubBranches,
  getListGithubReposQueryKey,
  getListGithubBranchesQueryKey,
  useUpdatePipelineConfig,
  useDeletePipelineConfig,
  useTestPipelineConnection,
  useDeletePipelineSource,
  type ConnectionTestResult,
  type PipelineConfig,
} from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  X,
  Shield,
  Github,
  AppWindow,
  Bell,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
  Pencil,
  Trash2,
  PlugZap,
  MinusCircle,
  Rocket,
  Copy,
  Upload,
} from "lucide-react";
import { useState, type ComponentType } from "react";

const configSchema = z.object({
  name: z.string().min(1, "Give this pipeline a name"),
  githubOwner: z.string().min(1, "Choose a repository"),
  githubRepo: z.string().min(1, "Choose a repository"),
  githubBranch: z.string().min(1, "Choose a branch"),
  easProjectSlug: z.string().min(1, "EAS project slug is required"),
  appStoreAppleId: z.string().min(1, "Apple ID is required"),
  appStoreBundleId: z.string().optional(),
  easToken: z.string().optional(),
  appStoreKeyId: z.string().optional(),
  appStoreIssuerId: z.string().optional(),
  appStorePrivateKey: z.string().optional(),
  notifyWebhookUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  autoDeployOnPush: z.boolean().optional(),
});

type ConfigForm = z.infer<typeof configSchema>;

/** A help link that opens in a new tab. */
function HelpLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
    >
      {children}
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}

/** Header for a guided section, with a required/optional badge. */
function SectionHeader({
  icon: Icon,
  title,
  description,
  required,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: React.ReactNode;
  required: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 rounded-md bg-primary/10 p-2 text-primary">
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-mono font-semibold tracking-tight">{title}</h3>
          <Badge
            variant={required ? "default" : "secondary"}
            className="text-[10px] uppercase tracking-wider"
          >
            {required ? "Required" : "Optional"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

export default function Settings() {
  const { data: configs, isLoading } = useListPipelineConfigs();
  const createConfig = useCreatePipelineConfig();
  const updateConfig = useUpdatePipelineConfig();
  const deleteConfig = useDeletePipelineConfig();
  const testConnection = useTestPipelineConnection();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, ConnectionTestResult[]>>({});
  const showForm = isCreating || editingId !== null;

  const githubStatus = useGetGithubStatus();
  const connected = githubStatus.data?.connected ?? false;
  const githubLogin = githubStatus.data?.login;

  const reposQuery = useListGithubRepos({
    query: { enabled: connected, queryKey: getListGithubReposQueryKey() },
  });
  const repos = reposQuery.data ?? [];

  const form = useForm<ConfigForm>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      name: "",
      githubOwner: "",
      githubRepo: "",
      githubBranch: "main",
      easProjectSlug: "",
      appStoreAppleId: "",
      appStoreBundleId: "",
      easToken: "",
      appStoreKeyId: "",
      appStoreIssuerId: "",
      appStorePrivateKey: "",
      notifyWebhookUrl: "",
      autoDeployOnPush: false,
    },
  });

  const owner = form.watch("githubOwner");
  const repo = form.watch("githubRepo");
  const selectedFullName = owner && repo ? `${owner}/${repo}` : "";
  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/github`
      : "/api/webhooks/github";

  const branchesQuery = useListGithubBranches(owner, repo, {
    query: {
      enabled: connected && !!owner && !!repo,
      queryKey: getListGithubBranchesQueryKey(owner, repo),
    },
  });
  const branches = branchesQuery.data ?? [];

  function handleSelectRepo(fullName: string) {
    const r = repos.find((x) => x.fullName === fullName);
    if (!r) return;
    form.setValue("githubOwner", r.owner, { shouldValidate: true });
    form.setValue("githubRepo", r.repo, { shouldValidate: true });
    form.setValue("githubBranch", r.defaultBranch, { shouldValidate: true });
  }

  function closeForm() {
    setIsCreating(false);
    setEditingId(null);
    form.reset();
  }

  function startEdit(config: NonNullable<typeof configs>[number]) {
    setIsCreating(false);
    setEditingId(config.id);
    form.reset({
      name: config.name,
      githubOwner: config.githubOwner,
      githubRepo: config.githubRepo,
      githubBranch: config.githubBranch,
      easProjectSlug: config.easProjectSlug,
      appStoreAppleId: config.appStoreAppleId ?? "",
      appStoreBundleId: config.appStoreBundleId ?? "",
      easToken: "",
      appStoreKeyId: "",
      appStoreIssuerId: "",
      appStorePrivateKey: "",
      notifyWebhookUrl: config.notifyWebhookUrl ?? "",
      autoDeployOnPush: config.autoDeployOnPush ?? false,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Pull the server's actionable message out of a failed request, if present. */
  function serverError(err: unknown, fallback: string): string {
    const data = (err as { data?: unknown } | undefined)?.data;
    if (data && typeof data === "object" && "error" in data) {
      const m = (data as { error?: unknown }).error;
      if (typeof m === "string" && m.trim()) return m;
    }
    return fallback;
  }

  const onSubmit = (data: ConfigForm) => {
    if (editingId !== null) {
      const payload = {
        name: data.name,
        githubOwner: data.githubOwner,
        githubRepo: data.githubRepo,
        githubBranch: data.githubBranch,
        easProjectSlug: data.easProjectSlug,
        appStoreAppleId: data.appStoreAppleId,
        appStoreBundleId: data.appStoreBundleId ?? "",
        notifyWebhookUrl: data.notifyWebhookUrl ?? "",
        autoDeployOnPush: data.autoDeployOnPush ?? false,
        ...(data.easToken ? { easToken: data.easToken } : {}),
        ...(data.appStoreKeyId ? { appStoreKeyId: data.appStoreKeyId } : {}),
        ...(data.appStoreIssuerId ? { appStoreIssuerId: data.appStoreIssuerId } : {}),
        ...(data.appStorePrivateKey ? { appStorePrivateKey: data.appStorePrivateKey } : {}),
      };
      updateConfig.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Pipeline updated", description: "Your changes have been saved." });
            queryClient.invalidateQueries({ queryKey: getListPipelineConfigsQueryKey() });
            closeForm();
          },
          onError: (err) => {
            toast({
              title: "Couldn't update pipeline",
              description: serverError(err, "Please check the fields and try again."),
              variant: "destructive",
            });
          },
        },
      );
      return;
    }

    createConfig.mutate(
      { data },
      {
        onSuccess: () => {
          toast({ title: "Pipeline saved", description: "Your deployment pipeline is ready to run." });
          queryClient.invalidateQueries({ queryKey: getListPipelineConfigsQueryKey() });
          closeForm();
        },
        onError: (err) => {
          toast({
            title: "Couldn't save pipeline",
            description: serverError(err, "Please check the fields and try again."),
            variant: "destructive",
          });
        },
      },
    );
  };

  function handleTest(id: number) {
    setTestingId(id);
    testConnection.mutate(
      { id },
      {
        onSuccess: (res) => {
          setTestResults((prev) => ({ ...prev, [id]: res.results }));
        },
        onError: (err) => {
          toast({
            title: "Couldn't test connection",
            description: serverError(err, "Please try again in a moment."),
            variant: "destructive",
          });
        },
        onSettled: () => setTestingId(null),
      },
    );
  }

  function handleDelete(id: number) {
    deleteConfig.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Pipeline deleted" });
          queryClient.invalidateQueries({ queryKey: getListPipelineConfigsQueryKey() });
          if (editingId === id) closeForm();
        },
        onError: (err) => {
          toast({
            title: "Couldn't delete pipeline",
            description: serverError(err, "Please try again."),
            variant: "destructive",
          });
        },
      },
    );
  }

  return (
    <Shell>
      <div className="p-8 max-w-5xl mx-auto space-y-8">
        <header className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-mono font-bold tracking-tight">Settings</h1>
            <p className="text-muted-foreground mt-2">
              Set up a deployment pipeline. We'll guide you through each step.
            </p>
          </div>
          {!showForm && (
            <Button onClick={() => setIsCreating(true)} className="font-mono">
              New Pipeline
            </Button>
          )}
        </header>

        {/* How it works — quick orientation for first-time users */}
        {!showForm && (
          <Card className="border-border bg-card/60">
            <CardHeader className="pb-3">
              <CardTitle className="font-mono text-base">How a deployment works</CardTitle>
              <CardDescription>
                Each pipeline runs three stages automatically, in order.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { icon: Github, label: "1. Code Sync", text: "Pushes your code to GitHub." },
                  { icon: AppWindow, label: "2. EAS Build", text: "Builds your iOS app with Expo." },
                  { icon: Shield, label: "3. App Store", text: "Submits the build to TestFlight." },
                ].map((s) => (
                  <div key={s.label} className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/40 p-3">
                    <s.icon className="w-4 h-4 mt-0.5 text-primary" />
                    <div>
                      <p className="font-mono text-sm font-medium">{s.label}</p>
                      <p className="text-xs text-muted-foreground">{s.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {showForm && (
          <Card className="border-primary/50 shadow-[0_0_20px_rgba(0,255,255,0.1)]">
            <CardHeader>
              <CardTitle className="font-mono">
                {editingId !== null ? "Edit pipeline" : "Create a pipeline"}
              </CardTitle>
              <CardDescription>
                {editingId !== null ? (
                  <>
                    Update any field below. Leave credential fields{" "}
                    <span className="text-foreground font-medium">blank to keep</span> the ones you already saved.
                  </>
                ) : (
                  <>
                    Fields marked <span className="text-foreground font-medium">Required</span> are needed to save.
                    Credentials marked <span className="text-foreground font-medium">Optional</span> can be added later —
                    without them, that stage runs in safe test mode (no real build or submission).
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                  <Alert>
                    <Lock className="h-4 w-4" />
                    <AlertTitle>Prefer Replit Secrets? (optional)</AlertTitle>
                    <AlertDescription>
                      Any credential below can instead be provided as a Replit Secret, which
                      takes precedence over a value saved here. Use a global name to share
                      across pipelines (e.g.{" "}
                      <code className="font-mono text-xs">SHIPKIT_EAS_TOKEN</code>), or{" "}
                      <code className="font-mono text-xs">SHIPKIT_PIPELINE_&lt;id&gt;_EAS_TOKEN</code>{" "}
                      for one pipeline only. Supported suffixes:{" "}
                      <code className="font-mono text-xs">GITHUB_TOKEN</code>,{" "}
                      <code className="font-mono text-xs">EAS_TOKEN</code>,{" "}
                      <code className="font-mono text-xs">APP_STORE_KEY_ID</code>,{" "}
                      <code className="font-mono text-xs">APP_STORE_ISSUER_ID</code>,{" "}
                      <code className="font-mono text-xs">APP_STORE_PRIVATE_KEY</code>.
                    </AlertDescription>
                  </Alert>

                  {/* Pipeline name */}
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem className="max-w-md">
                        <FormLabel>Pipeline name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. My App — Production" {...field} />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">A label so you can recognize this pipeline later.</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Separator />

                  {/* GitHub */}
                  <section className="space-y-4">
                    <SectionHeader
                      icon={Github}
                      title="Your code (GitHub)"
                      required
                      description="Pick the repository and branch to deploy. No access token needed — we use your connected GitHub account."
                    />

                    {githubStatus.isLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" /> Checking GitHub connection…
                      </div>
                    ) : connected ? (
                      <>
                        <Alert className="border-emerald-500/30 bg-emerald-500/5">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          <AlertTitle className="text-emerald-500">GitHub connected</AlertTitle>
                          <AlertDescription>
                            Signed in as <span className="font-mono">@{githubLogin}</span>. Your repositories are listed below.
                          </AlertDescription>
                        </Alert>

                        <div className="grid gap-6 sm:grid-cols-2">
                          <FormField
                            control={form.control}
                            name="githubRepo"
                            render={() => (
                              <FormItem>
                                <FormLabel>Repository</FormLabel>
                                <Select value={selectedFullName} onValueChange={handleSelectRepo}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue
                                        placeholder={reposQuery.isLoading ? "Loading repositories…" : "Choose a repository"}
                                      />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {repos.map((r) => (
                                      <SelectItem key={r.fullName} value={r.fullName}>
                                        <span className="font-mono">{r.fullName}</span>
                                        {r.private && (
                                          <Lock className="ml-2 inline w-3 h-3 text-muted-foreground" />
                                        )}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                  {reposQuery.isError
                                    ? "Couldn't load repositories — try refreshing."
                                    : "The repo holding your app's source code."}
                                </p>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="githubBranch"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Branch</FormLabel>
                                <Select
                                  value={field.value}
                                  onValueChange={field.onChange}
                                  disabled={!selectedFullName}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue
                                        placeholder={
                                          !selectedFullName
                                            ? "Pick a repository first"
                                            : branchesQuery.isLoading
                                              ? "Loading branches…"
                                              : "Choose a branch"
                                        }
                                      />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {branches.map((b) => (
                                      <SelectItem key={b} value={b} className="font-mono">
                                        {b}
                                      </SelectItem>
                                    ))}
                                    {field.value && !branches.includes(field.value) && (
                                      <SelectItem value={field.value} className="font-mono">
                                        {field.value}
                                      </SelectItem>
                                    )}
                                  </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                  The branch we'll deploy from (often <span className="font-mono">main</span>).
                                </p>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <Alert className="border-amber-500/30 bg-amber-500/5">
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                          <AlertTitle className="text-amber-500">GitHub not connected</AlertTitle>
                          <AlertDescription>
                            Connect your GitHub account to pick repositories from a list. For now, you can type the
                            details manually below.
                          </AlertDescription>
                        </Alert>
                        <div className="grid gap-6 sm:grid-cols-3">
                          <FormField
                            control={form.control}
                            name="githubOwner"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Owner</FormLabel>
                                <FormControl>
                                  <Input placeholder="your-username" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="githubRepo"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Repository</FormLabel>
                                <FormControl>
                                  <Input placeholder="my-app" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="githubBranch"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Branch</FormLabel>
                                <FormControl>
                                  <Input placeholder="main" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </>
                    )}
                  </section>

                  <Separator />

                  {/* EAS Build */}
                  <section className="space-y-4">
                    <SectionHeader
                      icon={AppWindow}
                      title="App build (Expo EAS)"
                      required={false}
                      description={
                        <>
                          Expo Application Services builds your iOS app in the cloud. Get a token from{" "}
                          <HelpLink href="https://expo.dev/settings/access-tokens">
                            expo.dev → Access Tokens
                          </HelpLink>
                          .
                        </>
                      }
                    />
                    <div className="grid gap-6 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="easProjectSlug"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>EAS project slug</FormLabel>
                            <FormControl>
                              <Input placeholder="my-app" {...field} />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              The project name shown in your Expo dashboard. <Badge variant="default" className="ml-1 text-[10px]">Required</Badge>
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="easToken"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>EAS access token</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="Leave blank for test mode" {...field} />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              Needed to start real builds. Stored encrypted.
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </section>

                  <Separator />

                  {/* App Store */}
                  <section className="space-y-4">
                    <SectionHeader
                      icon={Shield}
                      title="App Store (Apple)"
                      required={false}
                      description={
                        <>
                          Used to submit your build to TestFlight. Create an API key at{" "}
                          <HelpLink href="https://appstoreconnect.apple.com/access/integrations/api">
                            App Store Connect → Integrations → App Store Connect API
                          </HelpLink>
                          .
                        </>
                      }
                    />
                    <div className="grid gap-6 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="appStoreAppleId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>App Apple ID</FormLabel>
                            <FormControl>
                              <Input placeholder="1234567890" {...field} />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              The numeric App ID from your app's App Information page. <Badge variant="default" className="ml-1 text-[10px]">Required</Badge>
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="appStoreBundleId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Bundle ID</FormLabel>
                            <FormControl>
                              <Input placeholder="com.yourcompany.app" {...field} />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              Your app's unique identifier (e.g. com.acme.myapp).
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="appStoreKeyId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>API Key ID</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="Leave blank for test mode" {...field} />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">Shown next to the key you created.</p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="appStoreIssuerId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Issuer ID</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="Leave blank for test mode" {...field} />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">Found at the top of the API keys page.</p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="appStorePrivateKey"
                        render={({ field }) => (
                          <FormItem className="sm:col-span-2">
                            <FormLabel>Private key (.p8 file)</FormLabel>
                            <FormControl>
                              <Textarea
                                rows={6}
                                className="font-mono text-xs"
                                placeholder={"-----BEGIN PRIVATE KEY-----\n…paste the full contents of your AuthKey_XXXX.p8 file…\n-----END PRIVATE KEY-----"}
                                {...field}
                              />
                            </FormControl>
                            <p className="text-xs text-muted-foreground">
                              Open the AuthKey_XXXX.p8 file you downloaded and paste its entire contents. Stored encrypted.
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </section>

                  <Separator />

                  {/* Notifications */}
                  <section className="space-y-4">
                    <SectionHeader
                      icon={Bell}
                      title="Notifications"
                      required={false}
                      description="Get a ping when a deployment finishes. Works with Slack, Discord, or any webhook."
                    />
                    <FormField
                      control={form.control}
                      name="notifyWebhookUrl"
                      render={({ field }) => (
                        <FormItem className="max-w-xl">
                          <FormLabel>Completion webhook URL</FormLabel>
                          <FormControl>
                            <Input placeholder="https://hooks.example.com/shipkit" {...field} />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">
                            We send a POST here when a run finishes (success or failure).
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </section>

                  <Separator />

                  {/* Auto-deploy on push */}
                  <section className="space-y-4">
                    <SectionHeader
                      icon={Rocket}
                      title="Auto-deploy on push"
                      required={false}
                      description="Run this pipeline automatically whenever its branch receives a push on GitHub."
                    />
                    <FormField
                      control={form.control}
                      name="autoDeployOnPush"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between gap-4 rounded-md border border-border p-4 max-w-xl">
                          <div className="space-y-0.5">
                            <FormLabel>Enable auto-deploy</FormLabel>
                            <p className="text-xs text-muted-foreground">
                              When on, a push to{" "}
                              <span className="font-mono">
                                {form.watch("githubBranch") || "the configured branch"}
                              </span>{" "}
                              starts a run automatically.
                            </p>
                          </div>
                          <FormControl>
                            <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    {form.watch("autoDeployOnPush") && (
                      <Alert className="max-w-xl">
                        <PlugZap className="h-4 w-4" />
                        <AlertTitle>One-time GitHub setup</AlertTitle>
                        <AlertDescription className="space-y-2 text-xs">
                          <p>
                            In your repo on GitHub, open{" "}
                            <span className="font-mono">Settings → Webhooks → Add webhook</span> and use
                            this payload URL:
                          </p>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 break-all rounded bg-muted px-2 py-1 font-mono">
                              {webhookUrl}
                            </code>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                navigator.clipboard?.writeText(webhookUrl);
                                toast({ title: "Webhook URL copied" });
                              }}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                          <p>
                            Set <span className="font-mono">Content type</span> to{" "}
                            <span className="font-mono">application/json</span>, select the{" "}
                            <span className="font-mono">push</span> event, and set the{" "}
                            <span className="font-mono">Secret</span> to the value stored in your{" "}
                            <span className="font-mono">SHIPKIT_GITHUB_WEBHOOK_SECRET</span> secret.
                          </p>
                        </AlertDescription>
                      </Alert>
                    )}
                  </section>

                  <div className="flex justify-end gap-4">
                    <Button variant="outline" type="button" onClick={closeForm}>
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={createConfig.isPending || updateConfig.isPending}
                      className="font-mono"
                    >
                      {editingId !== null
                        ? updateConfig.isPending
                          ? "Saving…"
                          : "Save changes"
                        : createConfig.isPending
                          ? "Saving…"
                          : "Save pipeline"}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          <h2 className="text-xl font-mono font-bold tracking-tight">Your pipelines</h2>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !configs?.length ? (
            <p className="text-sm text-muted-foreground">No pipelines yet. Click “New Pipeline” to create one.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {configs.map((config) => (
                <Card key={config.id} className="border-border bg-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="font-mono flex justify-between items-center">
                      {config.name}
                      <Badge variant="outline" className="text-xs">
                        ID: {config.id}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="font-mono text-xs">
                      {config.githubOwner}/{config.githubRepo} • {config.githubBranch}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 mt-4">
                      <StatusRow
                        icon={Github}
                        label={
                          config.sourceType === "upload" || config.hasUploadedSource
                            ? "Zip Source"
                            : "Code Sync (GitHub)"
                        }
                        ok={
                          config.sourceType === "upload" || config.hasUploadedSource
                            ? true
                            : connected || !!config.hasGithubToken
                        }
                      />
                      <StatusRow icon={AppWindow} label="EAS Build" ok={!!config.hasEasToken} />
                      <StatusRow icon={Shield} label="App Store" ok={!!config.hasAppStoreKey} />
                      <StatusRow
                        icon={Bell}
                        label="Notifications"
                        ok={!!config.notifyWebhookUrl}
                        optional
                      />
                    </div>

                    <PipelineSourcePanel config={config} />

                    <div className="mt-4 flex items-center justify-between gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="font-mono"
                        disabled={testingId === config.id}
                        onClick={() => handleTest(config.id)}
                      >
                        {testingId === config.id ? (
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <PlugZap className="w-3.5 h-3.5 mr-1.5" />
                        )}
                        Test connection
                      </Button>
                      <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="font-mono"
                        onClick={() => startEdit(config)}
                      >
                        <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="font-mono text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete “{config.name}”?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This permanently removes the pipeline, its saved credentials, and its run
                              history. This can't be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(config.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      </div>
                    </div>
                    {testResults[config.id] && (
                      <div className="mt-3 space-y-1.5">
                        {testResults[config.id].map((r) => (
                          <ConnectionResultRow key={r.service} result={r} />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

/** A single credential/status row inside a pipeline card. */
function StatusRow({
  icon: Icon,
  label,
  ok,
  optional,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  ok: boolean;
  optional?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm p-2 rounded bg-background/50 border border-border/50">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4" /> {label}
      </div>
      {ok ? (
        <Check className="w-4 h-4 text-emerald-500" />
      ) : (
        <X className={optional ? "w-4 h-4 text-muted-foreground/40" : "w-4 h-4 text-destructive"} />
      )}
    </div>
  );
}

const CONNECTION_SERVICE_LABELS: Record<ConnectionTestResult["service"], string> = {
  github: "Code Sync (GitHub)",
  eas: "EAS Build",
  appstore: "App Store",
};

/** One row of a connection test result: green (valid), red (error), or muted (skipped). */
function ConnectionResultRow({ result }: { result: ConnectionTestResult }) {
  const { service, status, message } = result;
  const Icon = status === "ok" ? CheckCircle2 : status === "error" ? AlertCircle : MinusCircle;
  const iconColor =
    status === "ok"
      ? "text-emerald-500"
      : status === "error"
        ? "text-destructive"
        : "text-muted-foreground/60";
  return (
    <div className="flex items-start gap-2 rounded border border-border/50 bg-background/50 p-2 text-xs">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} />
      <div className="min-w-0">
        <p className="font-mono font-medium">{CONNECTION_SERVICE_LABELS[service]}</p>
        <p className="text-muted-foreground break-words">{message}</p>
      </div>
    </div>
  );
}

/** Source management panel inside a pipeline card. */
function PipelineSourcePanel({ config }: { config: PipelineConfig }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteSource = useDeletePipelineSource();

  const isUploadActive = config.sourceType === "upload" || config.hasUploadedSource;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const dropped = e.dataTransfer.files[0];
      if (dropped.name.endsWith(".zip")) {
        setFile(dropped);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const doUpload = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    setUploading(true);
    try {
      const res = await fetch(`/api/pipeline-configs/${config.id}/upload-source`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        toast({ title: "Upload failed", description: err.error, variant: "destructive" });
        return;
      }
      const data = await res.json();
      toast({ title: "Source uploaded", description: `${data.fileCount} files extracted` });
      queryClient.invalidateQueries({ queryKey: getListPipelineConfigsQueryKey() });
    } finally {
      setUploading(false);
      setFile(null);
    }
  };

  const doClear = () => {
    deleteSource.mutate(
      { id: config.id },
      {
        onSuccess: () => {
          toast({ title: "Source cleared", description: "Reverted to GitHub sync" });
          queryClient.invalidateQueries({ queryKey: getListPipelineConfigsQueryKey() });
        },
        onError: () => {
          toast({
            title: "Failed to clear source",
            description: "Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="mt-4 pt-4 border-t border-border space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-muted-foreground">Source</span>
        <Badge variant="secondary" className="text-[10px] font-mono">
          {isUploadActive ? "Zip Upload" : "GitHub Sync"}
        </Badge>
      </div>

      {isUploadActive ? (
        <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-md p-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-xs font-mono text-emerald-500 font-medium">Zip source active</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={doClear}
            disabled={deleteSource.isPending}
            className="h-6 text-xs text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/20 px-2"
          >
            {deleteSource.isPending ? "Clearing…" : "Clear upload"}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div
            className="border border-dashed border-border rounded-md p-3 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors relative h-16"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <input
              type="file"
              accept=".zip"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={uploading}
            />
            {file ? (
              <span className="text-xs font-mono truncate max-w-[200px]" title={file.name}>
                {file.name}
              </span>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Upload className="w-3.5 h-3.5" />
                <span className="text-xs font-mono">Drop a .zip or click</span>
              </div>
            )}
          </div>
          {file && (
            <Button
              size="sm"
              variant="outline"
              className="w-full font-mono text-xs h-7"
              onClick={doUpload}
              disabled={uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-3 h-3 mr-2 animate-spin" /> Uploading…
                </>
              ) : (
                "Upload"
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
