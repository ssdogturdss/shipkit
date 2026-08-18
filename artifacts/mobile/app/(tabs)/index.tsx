import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getGetPipelineStatsQueryKey,
  useGetPipelineStats,
  type PipelineRun,
} from "@workspace/api-client-react";

import {
  Card,
  EmptyState,
  FONT,
  ScreenHeader,
  StatCard,
  StatusBadge,
  useStatusMeta,
} from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { relativeTime } from "@/lib/format";

function RunListItem({ run }: { run: PipelineRun }) {
  const colors = useColors();
  const meta = useStatusMeta(run.status);
  return (
    <Pressable
      onPress={() => router.push(`/run/${run.id}`)}
      style={({ pressed }) => [
        styles.runRow,
        {
          borderColor: colors.border,
          backgroundColor: pressed ? colors.secondary : colors.card,
          borderRadius: colors.radius,
        },
      ]}
    >
      <View style={[styles.runDot, { backgroundColor: meta.color }]} />
      <View style={{ flex: 1 }}>
        <Text
          style={[styles.runName, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {run.configName?.trim() || `Pipeline #${run.id}`}
        </Text>
        <Text style={[styles.runMeta, { color: colors.mutedForeground }]}>
          #{run.id} · {relativeTime(run.createdAt)}
        </Text>
      </View>
      <StatusBadge status={run.status} size="sm" />
      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

export default function OverviewScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: stats, isLoading, isError, refetch, isRefetching } =
    useGetPipelineStats({
      query: {
        queryKey: getGetPipelineStatsQueryKey(),
        refetchInterval: 5000,
      },
    });

  const onRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const bottomPad = insets.bottom + (Platform.OS === "web" ? 100 : 96);
  const latest = stats?.recentRuns?.[0];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="ShipKit" subtitle="Deployment pipeline" />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <EmptyState
            icon="alert-triangle"
            title="Couldn't load stats"
            message="Check your connection and try again."
          />
          <Pressable
            onPress={onRefresh}
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
          >
            <Feather name="refresh-cw" size={16} color={colors.primaryForeground} />
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>
              Retry
            </Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: bottomPad, gap: 16 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        >
          <View style={styles.statRow}>
            <StatCard
              label="Total runs"
              value={stats?.totalRuns ?? 0}
              icon="layers"
              accent={colors.primary}
            />
            <StatCard
              label="Success rate"
              value={`${stats?.successRate ?? 0}%`}
              icon="trending-up"
              accent={colors.success}
            />
          </View>
          <View style={styles.statRow}>
            <StatCard
              label="Active"
              value={stats?.runningRuns ?? 0}
              icon="activity"
              accent={colors.running}
            />
            <StatCard
              label="Failed"
              value={stats?.failedRuns ?? 0}
              icon="alert-octagon"
              accent={colors.failed}
            />
          </View>

          {latest ? (
            <View style={{ gap: 10 }}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
                LATEST RUN
              </Text>
              <Pressable onPress={() => router.push(`/run/${latest.id}`)}>
                {({ pressed }) => (
                  <Card style={{ opacity: pressed ? 0.85 : 1, gap: 14 }}>
                    <View style={styles.latestTop}>
                      <Text
                        style={[styles.latestName, { color: colors.foreground }]}
                        numberOfLines={1}
                      >
                        {latest.configName?.trim() || `Pipeline #${latest.id}`}
                      </Text>
                      <StatusBadge status={latest.status} />
                    </View>
                    <View style={styles.latestMetaRow}>
                      <View style={styles.latestMetaItem}>
                        <Feather name="hash" size={13} color={colors.mutedForeground} />
                        <Text style={[styles.latestMeta, { color: colors.mutedForeground }]}>
                          Run {latest.id}
                        </Text>
                      </View>
                      <View style={styles.latestMetaItem}>
                        <Feather name="clock" size={13} color={colors.mutedForeground} />
                        <Text style={[styles.latestMeta, { color: colors.mutedForeground }]}>
                          {relativeTime(latest.createdAt)}
                        </Text>
                      </View>
                      {latest.currentStage ? (
                        <View style={styles.latestMetaItem}>
                          <Feather name="git-commit" size={13} color={colors.mutedForeground} />
                          <Text style={[styles.latestMeta, { color: colors.mutedForeground }]}>
                            {latest.currentStage}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </Card>
                )}
              </Pressable>
            </View>
          ) : null}

          <View style={{ gap: 10 }}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
              RECENT ACTIVITY
            </Text>
            {stats && stats.recentRuns.length > 0 ? (
              <View style={{ gap: 8 }}>
                {stats.recentRuns.map((run) => (
                  <RunListItem key={run.id} run={run} />
                ))}
              </View>
            ) : (
              <EmptyState
                icon="inbox"
                title="No runs yet"
                message="Trigger a deploy from the Pipelines tab to see activity here."
              />
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  statRow: { flexDirection: "row", gap: 12 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: FONT.semibold,
    letterSpacing: 1,
  },
  latestTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  latestName: { flex: 1, fontSize: 18, fontFamily: FONT.semibold },
  latestMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  latestMetaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  latestMeta: { fontSize: 13, fontFamily: FONT.medium },
  runRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderWidth: 1,
  },
  runDot: { width: 8, height: 8, borderRadius: 4 },
  runName: { fontSize: 15, fontFamily: FONT.semibold },
  runMeta: { fontSize: 12, fontFamily: FONT.regular, marginTop: 2 },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  retryText: { fontSize: 14, fontFamily: FONT.semibold },
});
