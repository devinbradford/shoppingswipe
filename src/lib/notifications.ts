import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

/**
 * Local notifications only (scheduled by the phone itself). They work in Expo Go;
 * server-sent push needs a development build and comes later. Not available on web.
 */
export const notificationsSupported = Platform.OS !== 'web';

/** Where a tapped weekly reminder takes them. */
const WEEKLY_PATH = '/weekly';

let started = false;

/** Show reminders even while the app is open, and open the weekly 10 when one is tapped. */
export function startNotifications(): () => void {
  if (!notificationsSupported || started) return () => {};
  started = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  const open = (r: Notifications.NotificationResponse | null) => {
    if (r?.notification.request.content.data?.path === WEEKLY_PATH) router.push(WEEKLY_PATH);
  };
  // Opened the app by tapping a reminder.
  Notifications.getLastNotificationResponseAsync()
    .then(open)
    .catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener(open);
  return () => {
    sub.remove();
    started = false;
  };
}

/**
 * Asks the phone for permission (only after they said yes on our own card), then schedules
 * "Your weekly 10 is ready" every Monday at 9:00. Returns the reminder's id, or null if not allowed.
 */
export async function scheduleWeeklyReminder(): Promise<string | null> {
  if (!notificationsSupported) return null;
  const current = await Notifications.getPermissionsAsync();
  const status = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!status.granted) return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('weekly', {
      name: 'Your weekly 10',
      importance: AndroidImportance.DEFAULT,
    });
  }
  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Your weekly 10 is ready',
      body: 'Ten new picks for your taste, chosen for this week.',
      data: { path: WEEKLY_PATH },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      channelId: 'weekly',
      // 1 = Sunday, so 2 = Monday.
      weekday: 2,
      hour: 9,
      minute: 0,
    },
  });
}

export async function cancelReminder(id: string | null): Promise<void> {
  if (!notificationsSupported || !id) return;
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}
