import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { notificationService } from '../services/notificationService';

let started = false;

// Initialise les notifications push (mobile uniquement). No-op sur web.
export async function initPush() {
  if (started || !Capacitor.isNativePlatform()) return;
  started = true;
  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') return;

    // Listeners AVANT register() (sinon l'event 'registration' part avant et le token est perdu)
    await PushNotifications.addListener('registration', (t) => {
      notificationService.registerDeviceToken(t.value, Capacitor.getPlatform()).catch(() => {});
    });
    await PushNotifications.addListener('registrationError', () => {});

    await PushNotifications.register();
  } catch (e) {
    /* ignore */
  }
}
