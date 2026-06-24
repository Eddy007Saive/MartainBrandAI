import { Capacitor } from '@capacitor/core';

// Lien vers la dernière APK (GitHub Release)
export const APK_URL =
  'https://github.com/Eddy007Saive/MartainBrandAI/releases/latest/download/PresenceOS.apk';

const KEY = 'apk_downloaded';

// Dans l'app mobile native ? -> déjà installée
export const isNativeApp = () => Capacitor.isNativePlatform();

// Masquer le téléchargement si : on est déjà dans l'app native, OU déjà téléchargé/ignoré
export const downloadHidden = () => isNativeApp() || localStorage.getItem(KEY) === '1';

// Mémorise que l'utilisateur a téléchargé / ignoré -> ne plus afficher
export const markDownloaded = () => { try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ } };
