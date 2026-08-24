import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Camera, EncodingType, MediaTypeSelection, type MediaResult } from '@capacitor/camera';
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

async function mediaToFile(media: MediaResult): Promise<File | null> {
  const src = media.webPath || media.uri;
  if (!src) return null;
  const response = await fetch(src);
  const blob = await response.blob();
  return new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' });
}

export async function pickFromCamera(): Promise<File | null> {
  if (!isNative()) return null;
  try {
    await Camera.requestPermissions({ permissions: ['camera'] });
    const photo = await Camera.takePhoto({
      quality: 80,
      targetWidth: 1600,
      targetHeight: 1600,
      correctOrientation: true,
      encodingType: EncodingType.JPEG,
      webUseInput: true,
    });
    return mediaToFile(photo);
  } catch {
    return null;
  }
}

export async function pickFromGallery(): Promise<File | null> {
  if (!isNative()) return null;
  try {
    await Camera.requestPermissions({ permissions: ['photos'] });
    const picked = await Camera.chooseFromGallery({
      mediaType: MediaTypeSelection.Photo,
      allowMultipleSelection: false,
      quality: 80,
      targetWidth: 1600,
      targetHeight: 1600,
    });
    const first = picked.results[0];
    return first ? mediaToFile(first) : null;
  } catch {
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
