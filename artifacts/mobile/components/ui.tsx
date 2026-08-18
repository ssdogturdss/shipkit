import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

type FeatherName = React.ComponentProps<typeof Feather>["name"];

export const FONT = {
  light: "Outfit_300Light",
  regular: "Outfit_400Regular",
  medium: "Outfit_500Medium",
  semibold: "Outfit_600SemiBold",
  bold: "Outfit_700Bold",
  mono: "SpaceMono_400Regular",
  monoBold: "SpaceMono_700Bold",
} as const;

export interface StatusMeta {
  color: string;
  icon: FeatherName;
  label: string;
}

export function useStatusMeta(status?: string | null): StatusMeta {
  const colors = useColors();
  switch (status) {
    case "success":
      return { color: colors.success, icon: "check-circle", label: "Success" };
    case "failed":
      return { color: colors.failed, icon: "x-circle", label: "Failed" };
    case "running":
      return { color: colors.running, icon: "loader", label: "Running" };
    case "pending":
      return { color: colors.pending, icon: "clock", label: "Pending" };
    case "cancelled":
      return { color: colors.cancelled, icon: "slash", label: "Cancelled" };
    case "skipped":
      return { color: colors.skipped, icon: "minus-circle", label: "Skipped" };
    default:
      return { color: colors.mutedForeground, icon: "circle", label: status ?? "Unknown" };
  }
}

function hexWithAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

export function StatusBadge({
  status,
  size = "md",
}: {
  status?: string | null;
  size?: "sm" | "md";
}) {
  const meta = useStatusMeta(status);
  const isRunning = status === "running";
  const iconSize = size === "sm" ? 12 : 14;
  const fontSize = size === "sm" ? 11 : 13;
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: hexWithAlpha(meta.color, 0.14),
          paddingVertical: size === "sm" ? 3 : 5,
          paddingHorizontal: size === "sm" ? 7 : 10,
        },
      ]}
    >
      {isRunning ? (
        <ActivityIndicator size="small" color={meta.color} />
      ) : (
        <Feather name={meta.icon} size={iconSize} color={meta.color} />
      )}
      <Text style={{ color: meta.color, fontSize, fontFamily: FONT.semibold }}>
        {meta.label}
      </Text>
    </View>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: FeatherName;
  accent: string;
}) {
  const colors = useColors();
  return (
    <Card style={styles.statCard}>
      <View
        style={[
          styles.statIcon,
          { backgroundColor: hexWithAlpha(accent, 0.14) },
        ]}
      >
        <Feather name={icon} size={18} color={accent} />
      </View>
      <Text
        style={[styles.statValue, { color: colors.foreground }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
    </Card>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: topPad + 12,
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[styles.headerSubtitle, { color: colors.mutedForeground }]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  message,
}: {
  icon: FeatherName;
  title: string;
  message: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.centerBox}>
      <View
        style={[
          styles.emptyIcon,
          { backgroundColor: colors.secondary, borderColor: colors.border },
        ]}
      >
        <Feather name={icon} size={26} color={colors.mutedForeground} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
        {title}
      </Text>
      <Text style={[styles.emptyMessage, { color: colors.mutedForeground }]}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  card: {
    borderWidth: 1,
    padding: 16,
  },
  statCard: {
    flex: 1,
    gap: 8,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontSize: 28,
    fontFamily: FONT.bold,
  },
  statLabel: {
    fontSize: 13,
    fontFamily: FONT.medium,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: FONT.bold,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: FONT.regular,
    marginTop: 2,
  },
  centerBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: FONT.semibold,
  },
  emptyMessage: {
    fontSize: 14,
    fontFamily: FONT.regular,
    textAlign: "center",
    lineHeight: 20,
  },
});
