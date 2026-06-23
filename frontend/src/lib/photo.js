import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

// Caméra native dispo uniquement dans l'app (Android/iOS). Sur web -> on garde l'import fichier.
export const cameraAvailable = () => Capacitor.isNativePlatform();

// Ouvre l'appareil photo et renvoie un File prêt à uploader (même format que <input type=file>).
export async function takePhoto() {
  const photo = await Camera.getPhoto({
    source: CameraSource.Camera,
    resultType: CameraResultType.Uri,
    quality: 85,
    allowEditing: false,
    saveToGallery: false,
  });
  const res = await fetch(photo.webPath);
  const blob = await res.blob();
  const ext = photo.format || 'jpg';
  return new File([blob], `photo_${Date.now()}.${ext}`, { type: blob.type || 'image/jpeg' });
}
