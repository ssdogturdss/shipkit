import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/**
 * Local push notifications for pipeline run completion.
 *
 * We use local (on-device) notifications scheduled by the RunMonitor when a
 * watched run transitions to a terminal state. This works in Expo Go without a
 * custom dev build, unlike remote push tokens.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const ANDROID_CHANNEL = "pipeline-runs";

export async function ensureNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: "Pipeline Runs",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const settings = await Notifications.getPermissionsAsync();
  let granted =
    settings.granted ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

  if (!granted) {
    const requested = await Notifications.requestPermissionsAsync();
    granted =
      requested.granted ||
      requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  }

  return granted;
}

export async function notifyRunComplete(opts: {
  runId: number;
  configName: string;
  status: string;
}): Promise<void> {
  if (Platform.OS === "web") return;

  const succeeded = opts.status === "success";
  const name = opts.configName?.trim() || `Pipeline #${opts.runId}`;
  const title = succeeded ? "Deploy succeeded" : `Deploy ${opts.status}`;
  const body = succeeded
    ? `${name} finished successfully.`
    : `${name} ended with status: ${opts.status}.`;

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { runId: opts.runId },
      ...(Platform.OS === "android" ? { channelId: ANDROID_CHANNEL } : {}),
    },
    trigger: null,
  });
}
