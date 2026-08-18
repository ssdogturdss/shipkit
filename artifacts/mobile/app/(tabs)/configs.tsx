import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  getListPipelineConfigsQueryKey,
  getListPipelineRunsQueryKey,
  useListPipelineConfigs,
  useListPipelineRuns,
  useTriggerPipelineRun,
  type PipelineConfig,
  type PipelineRun,
} from "@workspace/api-client-react";

import {
  Card,
  EmptyState,
  FONT,
  ScreenHeader,
  StatusBadge,
} from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { relativeTime } from "@/lib/format";

function confirmDeploy(name: string, onConfirm: () => void) {
  if (Platform.OS === "web") {
    if (
      typeof window !== "undefined" &&
      window.confirm(`Trigger a new deploy for "${name}"?`)
    ) {
      onConfirm();
    }
    return;
  }
  Alert.alert(
    "Trigger deploy",
    `Start a new pipeline run for "${name}"?`,
    [
      { text: "Cancel", style: "cancel" },
      { text: "Deploy", style: "default", onPress: onConfirm },
    ],
    { cancelable: true },
  );
}

function ConfigCard({
  config,
  latestRun,
  triggering,
  onDeploy,
}: {
  config: PipelineConfig;
  latestRun?: PipelineRun;
  triggering: boolean;
  onDeploy: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onDeploy}
      disabled={triggering}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? colors.secondary : colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
          opacity: triggering ? 0.7 : 1,
        },
      ]}
    >
      <View style={styles.cardTop}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            style={[styles.cardName, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {config.name}
          </Text>
          <View style={styles.repoRow}>
            <Feather name="github" size={13} color={colors.mutedForeground} />
            <Text
              style={[styles.repoText, { color: colors.mutedForeground }]}
              numberOfLines={1}
            >
              {config.githubOwner}/{config.githubRepo}
            </Text>
          </View>
        </View>
        {latestRun ? <StatusBadge status={latestRun.status} size="sm" /> : null}
      </View>

      <View style={[styles.metaRow, { borderTopColor: colors.border }]}>
        <View style={styles.metaItem}>
          <Feather name="git-branch" size={13} color={colors.mutedForeground} />
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
            {config.githubBranch}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Feather name="clock" size={13} color={colors.mutedForeground} />
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
            {latestRun ? relativeTime(latestRun.createdAt) : "No runs yet"}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.deployBtn,
          {
            backgroundColor: triggering ? colors.secondary : colors.primary,
            borderRadius: colors.radius - 4,
          },
        ]}
      >
        {triggering ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Feather name="play" size={15} color={colors.primaryForeground} />
        )}
        <Text
          style={[
            styles.deployText,
            { color: triggering ? colors.primary : colors.primaryForeground },
          ]}
        >
          {triggering ? "Starting…" : "Deploy now"}
        </Text>
      </View>
    </Pressable>
  );
}

export default function PipelinesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [triggeringId, setTriggeringId] = useState<number | null>(null);

  const configsQuery = useListPipelineConfigs({
    query: {
      queryKey: getListPipelineConfigsQueryKey(),
      refetchInterval: 8000,
    },
  });
  const runsQuery = useListPipelineRuns(
    { limit: 100 },
    {
      query: {
        queryKey: getListPipelineRunsQueryKey({ limit: 100 }),
        refetchInterval: 5000,
      },
    },
  );
  const trigger = useTriggerPipelineRun();

  const latestByConfig = useMemo(() => {
    const map = new Map<number, PipelineRun>();
    // Runs come newest-first; first seen per config is the latest.
    for (const run of runsQuery.data ?? []) {
      if (!map.has(run.configId)) map.set(run.configId, run);
    }
    return map;
  }, [runsQuery.data]);

  const onRefresh = useCallback(() => {
    void configsQuery.refetch();
    void runsQuery.refetch();
  }, [configsQuery, runsQuery]);

  const handleDeploy = useCallback(
    (config: PipelineConfig) => {
      if (triggeringId !== null) return;
      confirmDeploy(config.name, () => {
        if (Platform.OS !== "web") {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
        setTriggeringId(config.id);
        trigger.mutate(
          { data: { configId: config.id } },
          {
            onSuccess: (run) => {
              setTriggeringId(null);
              void runsQuery.refetch();
              router.push(`/run/${run.id}`);
            },
            onError: () => {
              setTriggeringId(null);
              const msg = "Couldn't start the deploy. Please try again.";
              if (Platform.OS === "web") {
                if (typeof window !== "undefined") window.alert(msg);
              } else {
                Alert.alert("Deploy failed", msg);
              }
            },
          },
        );
      });
    },
    [triggeringId, trigger, runsQuery],
  );

  const bottomPad = insets.bottom + (Platform.OS === "web" ? 100 : 96);
  const configs = configsQuery.data ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Pipelines" subtitle="Tap a pipeline to deploy" />

      {configsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : configsQuery.isError ? (
        <View style={styles.center}>
          <EmptyState
            icon="alert-triangle"
            title="Couldn't load pipelines"
            message="Check your connection and try again."
          />
          <Pressable
            onPress={onRefresh}
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
          >
            <Feather
              name="refresh-cw"
              size={16}
              color={colors.primaryForeground}
            />
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>
              Retry
            </Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 20,
            paddingBottom: bottomPad,
            gap: 14,
          }}
          refreshControl={
            <RefreshControl
              refreshing={configsQuery.isRefetching}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        >
          {configs.length === 0 ? (
            <EmptyState
              icon="git-merge"
              title="No pipelines yet"
              message="Create a pipeline configuration in the dashboard to deploy from here."
            />
          ) : (
            configs.map((config) => (
              <ConfigCard
                key={config.id}
                config={config}
                latestRun={latestByConfig.get(config.id)}
                triggering={triggeringId === config.id}
                onDeploy={() => handleDeploy(config)}
              />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  card: { borderWidth: 1, padding: 16, gap: 14 },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  cardName: { fontSize: 17, fontFamily: FONT.semibold },
  repoRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  repoText: { fontSize: 13, fontFamily: FONT.mono, flexShrink: 1 },
  metaRow: {
    flexDirection: "row",
    gap: 20,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: 13, fontFamily: FONT.medium },
  deployBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 11,
  },
  deployText: { fontSize: 14, fontFamily: FONT.semibold },
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
