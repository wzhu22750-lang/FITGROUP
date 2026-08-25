import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Keyboard } from '@capacitor/keyboard';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { consumeBack } from './backStack';

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

function setKeyboardHeight(height: number) {
  const next = Math.max(0, Math.round(height));
  document.documentElement.style.setProperty('--keyboard-height', `${next}px`);
  document.documentElement.classList.toggle('keyboard-open', next > 80);
}

function syncVisualViewport() {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const covered = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
  setKeyboardHeight(covered);
}

export async function initNativeShell() {
  window.visualViewport?.addEventListener('resize', syncVisualViewport);
  window.visualViewport?.addEventListener('scroll', syncVisualViewport);

  if (!isNative()) return;

  try {
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: '#F4F4F4' });
  } catch (error) {
    console.warn('StatusBar init failed:', error);
  }

  const onKeyboardShow = (info: { keyboardHeight: number }) => {
    setKeyboardHeight(info.keyboardHeight);
    const focused = document.activeElement as HTMLElement | null;
    focused?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  Keyboard.addListener('keyboardWillShow', onKeyboardShow);
  Keyboard.addListener('keyboardDidShow', onKeyboardShow);
  Keyboard.addListener('keyboardWillHide', () => setKeyboardHeight(0));
  Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
}

export function listenAndroidBack(onUnhandled: () => void) {
  if (!isNative()) return () => undefined;

  const handle = App.addListener('backButton', () => {
    if (consumeBack()) return;
    onUnhandled();
  });

  return () => {
    void handle.then((listener) => listener.remove());
  };
}

export async function hideSplash() {
  if (!isNative()) return;
  try {
    await SplashScreen.hide();
  } catch (error) {
    console.warn('SplashScreen hide failed:', error);
  }
}

export async function exitApp() {
  if (!isNative()) return;
  await App.exitApp();
}

function dataUrlToFile(dataUrl: string, filename = 'photo.jpg'): File {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const byteString = atob(parts[1]);
  const length = byteString.length;
  const u8arr = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    u8arr[i] = byteString.charCodeAt(i);
  }
  return new File([u8arr], filename, { type: mime });
}

export async function pickFromCamera(): Promise<File | null> {
  if (!isNative()) return null;
  try {
    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      correctOrientation: true,
      width: 1600,
      height: 1600,
    });
    if (photo.dataUrl) {
      return dataUrlToFile(photo.dataUrl, 'camera-photo.jpg');
    }
    if (photo.base64String) {
      return dataUrlToFile(`data:image/jpeg;base64,${photo.base64String}`, 'camera-photo.jpg');
    }
    return null;
  } catch (error) {
    console.warn('pickFromCamera error:', error);
    return null;
  }
}

export async function pickFromGallery(): Promise<File | null> {
  if (!isNative()) return null;
  try {
    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Photos,
      correctOrientation: true,
      width: 1600,
      height: 1600,
    });
    if (photo.dataUrl) {
      return dataUrlToFile(photo.dataUrl, 'gallery-photo.jpg');
    }
    if (photo.base64String) {
      return dataUrlToFile(`data:image/jpeg;base64,${photo.base64String}`, 'gallery-photo.jpg');
    }
    return null;
  } catch (error) {
    console.warn('pickFromGallery error:', error);
    return null;
  }
}

export async function shareImageDataUrl(dataUrl: string, filename = 'fitgroup-poster.png') {
  if (isNative()) {
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    const written = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
    });
    await Share.share({
      title: 'FitGroup 训练海报',
      text: '我刚完成一次训练打卡',
      files: [written.uri],
      dialogTitle: '分享训练海报',
    });
    return;
  }

  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], filename, { type: 'image/png' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'FitGroup 训练海报',
        text: '我刚完成一次训练打卡',
      });
      return;
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError') return;
      throw error;
    }
  }

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.click();
}
