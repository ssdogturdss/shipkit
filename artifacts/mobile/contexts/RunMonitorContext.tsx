import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import {
  getListPipelineRunsQueryKey,
  useListPipelineRuns,
} from "@workspace/api-client-react";

import {
  ensureNotificationPermissions,
  notifyRunComplete,
} from "@/lib/notifications";

const TERMINAL = new Set(["success", "failed", "cancelled"]);

interface RunMonitorValue {
  notificationsEnabled: boolean;
}

const RunMonitorContext = createContext<RunMonitorValue>({
  notificationsEnabled: false,
});

export const useRunMonitor = () => useContext(RunMonitorContext);

/**
 * Watches all pipeline runs in the background and fires a local notification
 * whenever a run transitions from an active state to a terminal state. This is
 * what powers "push notification when a run completes" — including runs the
 * user triggered from their phone.
 */
export function RunMonitorProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const prevStatuses = useRef<Map<number, string> | null>(null);

  const { data } = useListPipelineRuns(
    { limit: 50 },
    {
      query: {
        queryKey: getListPipelineRunsQueryKey({ limit: 50 }),
        refetchInterval: 4000,
      },
    },
  );

  useEffect(() => {
    let mounted = true;
    ensureNotificationPermissions().then((granted) => {
      if (mounted) setNotificationsEnabled(granted);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Tapping a notification opens the relevant run.
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const runId = resp.notification.request.content.data?.runId;
      if (typeof runId === "number") {
        router.push(`/run/${runId}`);
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!data) return;

    const current = new Map<number, string>();
    for (const run of data) current.set(run.id, run.status);

    // First snapshot is a baseline only — never notify for pre-existing runs.
    if (prevStatuses.current === null) {
      prevStatuses.current = current;
      return;
    }

    for (const run of data) {
      const before = prevStatuses.current.get(run.id);
      if (before && !TERMINAL.has(before) && TERMINAL.has(run.status)) {
        void notifyRunComplete({
          runId: run.id,
          configName: run.configName ?? `Pipeline #${run.id}`,
          status: run.status,
        });
      }
    }

    prevStatuses.current = current;
  }, [data]);

  return (
    <RunMonitorContext.Provider value={{ notificationsEnabled }}>
      {children}
    </RunMonitorContext.Provider>
  );
}
