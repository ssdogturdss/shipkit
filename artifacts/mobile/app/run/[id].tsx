import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getGetPipelineRunQueryKey,
  useGetPipelineRun,
  type RunStage,
} from "@workspace/api-client-react";

import {
  Card,
  FONT,
  StatusBadge,
  useStatusMeta,
} from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { formatClock, formatDuration, relativeTime } from "@/lib/format";
import { useRunLogStream } from "@/lib/useRunLogStream";

const TERMINAL = new Set(["success", "failed", "cancelled"]);
const STAGE_ORDER: RunStage["stageName"][] = ["sync", "build", "submit"];
const STAGE_LABEL: Record<string, string> = {
  sync: "Sync",
  build: "Build",
  submit: "Submit",
};

function StageItem({ stage }: { stage: RunStage }) {
  const colors = useColors();
  const meta = useStatusMeta(stage.status);
  const duration = formatDuration(stage.startedAt, stage.completedAt);
  return (
    <View style={[styles.stageRow, { borderColor: colors.border }]}>
      <View style={[styles.stageIcon, { backgroundColor: colors.secondary }]}>
        {stage.status === "running" ? (
          <ActivityIndicator size="small" color={meta.color} />
        ) : (
          <Feather name={meta.icon} size={16} color={meta.color} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.stageName, { color: colors.foreground }]}>
          {STAGE_LABEL[stage.stageName] ?? stage.stageName}
        </Text>
        <Text style={[styles.stageMeta, { color: colors.mutedForeground }]}>
          {meta.label}
          {duration ? ` · ${duration}` : ""}
        </Text>
      </View>
      {stage.externalUrl ? (
        <Pressable
          hitSlop={10}
          onPress={() => Linking.openURL(stage.externalUrl as string)}
          style={[styles.linkBtn, { borderColor: colors.border }]}
        >
          <Feather name="external-link" size={15} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export default function RunDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const runId = Number(params.id);
  const validId = Number.isFinite(runId) ? runId : null;

  const { data: run, isLoading, isError } = useGetPipelineRun(runId, {
    query: {
      queryKey: getGetPipelineRunQueryKey(runId),
      enabled: validId !== null,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status && TERMINAL.has(status) ? false : 3000;
      },
    },
  });

  const { logs, connected, done, error: streamError } =
    useRunLogStream(validId);

  const logScrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (logs.length > 0) {
      logScrollRef.current?.scrollToEnd({ animated: true });
    }
  }, [logs.length]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const stages = run?.stages
    ? [...run.stages].sort(
        (a, b) =>
          STAGE_ORDER.indexOf(a.stageName) - STAGE_ORDER.indexOf(b.stageName),
      )
    : [];

  const logColor = (level: string) => {
    switch (level) {
      case "error":
        return colors.failed;
      case "warn":
        return colors.warn;
      case "success":
        return colors.success;
      default:
        return colors.mutedForeground;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 8,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable
          hitSlop={12}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          style={[styles.backBtn, { backgroundColor: colors.secondary }]}
        >
          <Feather name="chevron-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.headerTitle, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {run?.configName?.trim() || `Run #${validId ?? ""}`}
          </Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            Run #{validId} · {run ? relativeTime(run.createdAt) : "—"}
          </Text>
        </View>
        {run ? <StatusBadge status={run.status} /> : null}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : isError || !run ? (
        <View style={styles.center}>
          <Feather name="alert-triangle" size={28} color={colors.failed} />
          <Text style={[styles.errorText, { color: colors.foreground }]}>
            Couldn&apos;t load this run.
          </Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Top: summary + stages */}
          <View style={styles.topSection}>
            <Card style={{ gap: 12 }}>
              <View style={styles.summaryRow}>
                <SummaryItem
                  icon="clock"
                  label="Duration"
                  value={
                    formatDuration(run.startedAt, run.completedAt) ||
                    (run.status === "pending" ? "Queued" : "—")
                  }
                />
                <SummaryItem
                  icon="play-circle"
                  label="Started"
                  value={run.startedAt ? formatClock(run.startedAt) : "—"}
                />
                <SummaryItem
                  icon="git-commit"
                  label="Stage"
                  value={run.currentStage ?? "—"}
                />
              </View>
              {run.errorMessage ? (
                <View
                  style={[
                    styles.errorBox,
                    { backgroundColor: `${colors.failed}1a`, borderColor: `${colors.failed}55` },
                  ]}
                >
                  <Feather name="alert-octagon" size={15} color={colors.failed} />
                  <Text style={[styles.errorMsg, { color: colors.failed }]}>
                    {run.errorMessage}
                  </Text>
                </View>
              ) : null}
            </Card>

            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              STAGES
            </Text>
            <View style={{ gap: 8 }}>
              {stages.length > 0 ? (
                stages.map((s) => <StageItem key={s.id} stage={s} />)
              ) : (
                <Text style={[styles.stageMeta, { color: colors.mutedForeground }]}>
                  No stages reported yet.
                </Text>
              )}
            </View>

            <View style={styles.logsHeaderRow}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                LOGS
              </Text>
              <View style={styles.streamStatus}>
                <View
                  style={[
                    styles.streamDot,
                    {
                      backgroundColor: done
                        ? colors.mutedForeground
                        : connected
                          ? colors.success
                          : colors.warn,
                    },
                  ]}
                />
                <Text style={[styles.streamText, { color: colors.mutedForeground }]}>
                  {done ? "Completed" : connected ? "Live" : "Connecting…"}
                </Text>
              </View>
            </View>
          </View>

          {/* Logs (own scroll, auto-follow) */}
          <ScrollView
            ref={logScrollRef}
            style={[
              styles.logBox,
              { backgroundColor: "#05080f", borderColor: colors.border },
            ]}
            contentContainerStyle={{
              padding: 14,
              paddingBottom: insets.bottom + 20,
            }}
          >
            {streamError ? (
              <Text style={[styles.logLine, { color: colors.failed }]}>
                ⚠ {streamError}
              </Text>
            ) : null}
            {logs.length === 0 && !streamError ? (
              <Text style={[styles.logLine, { color: colors.mutedForeground }]}>
                {connected ? "Waiting for log output…" : "Connecting to log stream…"}
              </Text>
            ) : (
              logs.map((log) => (
                <View key={log.id} style={styles.logEntry}>
                  <Text style={[styles.logTime, { color: colors.cancelled }]}>
                    {formatClock(log.createdAt)}
                  </Text>
                  <Text
                    style={[styles.logLine, { color: logColor(log.level), flex: 1 }]}
                  >
                    {log.stage ? `[${log.stage}] ` : ""}
                    {log.message}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function SummaryItem({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  value: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.summaryItem}>
      <Feather name={icon} size={15} color={colors.primary} />
      <Text style={[styles.summaryValue, { color: colors.foreground }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  errorText: { fontSize: 15, fontFamily: FONT.medium },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 19, fontFamily: FONT.bold, letterSpacing: -0.3 },
  headerSub: { fontSize: 12, fontFamily: FONT.regular, marginTop: 2 },
  topSection: { padding: 20, gap: 12 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryItem: { flex: 1, alignItems: "center", gap: 4 },
  summaryValue: { fontSize: 15, fontFamily: FONT.semibold },
  summaryLabel: { fontSize: 11, fontFamily: FONT.medium, letterSpacing: 0.3 },
  errorBox: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  errorMsg: { flex: 1, fontSize: 13, fontFamily: FONT.mono, lineHeight: 18 },
  sectionLabel: {
    fontSize: 12,
    fontFamily: FONT.semibold,
    letterSpacing: 1,
  },
  stageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  stageIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  stageName: { fontSize: 15, fontFamily: FONT.semibold },
  stageMeta: { fontSize: 13, fontFamily: FONT.medium, marginTop: 2 },
  linkBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  streamStatus: { flexDirection: "row", alignItems: "center", gap: 6 },
  streamDot: { width: 8, height: 8, borderRadius: 4 },
  streamText: { fontSize: 12, fontFamily: FONT.medium },
  logBox: {
    flex: 1,
    marginHorizontal: 20,
    marginBottom: 0,
    borderWidth: 1,
    borderRadius: 12,
  },
  logEntry: { flexDirection: "row", gap: 10, marginBottom: 6 },
  logTime: { fontSize: 11, fontFamily: FONT.mono, paddingTop: 1 },
  logLine: { fontSize: 12.5, fontFamily: FONT.mono, lineHeight: 18 },
});
