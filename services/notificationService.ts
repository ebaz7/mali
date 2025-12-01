
const PREF_KEY = 'app_notification_pref';

export const isNotificationEnabledInApp = (): boolean => {
    return localStorage.getItem(PREF_KEY) !== 'false';
};

export const setNotificationPreference = (enabled: boolean) => {
    localStorage.setItem(PREF_KEY, String(enabled));
};

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!window.isSecureContext) return false;
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  try {
      const permission = await Notification.requestPermission();
      return permission === "granted";
  } catch (e) {
      console.warn("Notification request failed", e);
      return false;
  }
};

export const sendNotification = (title: string, body: string) => {
  if (!isNotificationEnabledInApp()) return;
  if (window.isSecureContext && Notification.permission === "granted") {
    new Notification(title, { body, dir: 'rtl', lang: 'fa' });
  }
};
