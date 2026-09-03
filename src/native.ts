import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
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
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Dark });
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

export function listenAppResume(onResume: () => void): () => void {
  const cleanups: (() => void)[] = [];

  if (isNative()) {
    const handle = App.addListener('appStateChange', (state) => {
      if (state.isActive) {
        onResume();
      }
    });
    cleanups.push(() => {
      void handle.then((listener) => listener.remove());
    });
  }

  const handleVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      onResume();
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibility);
    document.addEventListener('resume', onResume);
    cleanups.push(() => {
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('resume', onResume);
    });
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onResume);
    cleanups.push(() => {
      window.removeEventListener('focus', onResume);
    });
  }

  return () => {
    cleanups.forEach((fn) => {
      try {
        fn();
      } catch {
        // ignore
      }
    });
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

export async function exportTextFile(
  filename: string,
  content: string,
  mimeType = 'application/json'
) {
  if (isNative()) {
    try {
      const written = await Filesystem.writeFile({
        path: filename,
        data: content,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      await Share.share({
        title: 'FitGroup 数据导出',
        text: '我的健身数据备份文件',
        files: [written.uri],
        dialogTitle: '导出健身数据',
      });
      return;
    } catch (err) {
      console.warn('Native export text file failed:', err);
    }
  }

  const blob = new Blob([content], { type: mimeType });
  const file = new File([blob], filename, { type: mimeType });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'FitGroup 数据导出',
        text: '我的健身数据备份文件',
      });
      return;
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
