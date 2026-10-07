// Input for playwright-cli run-code; run against `vite preview --port 4178`.
async (page) => {
  await page.context().clearCookies();
  await page.context().addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', { get: () => false });
  });
  // Local HTTP stands in for Capacitor's packaged asset server. All external
  // requests fail. This is not a physical-device airplane-mode test.
  await page.context().route('**/*', route =>
    ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)
      ? route.continue() : route.abort('internetdisconnected'));
  await page.goto('http://127.0.0.1:4178');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.getByText('登录打卡', { exact: true }).waitFor();
  await page.getByRole('button', { name: '登录', exact: true }).click({ trial: true });
  const firstInstall = await page.evaluate(() => ({
    loginVisible: document.body.innerText.includes('登录打卡'),
    online: navigator.onLine,
    authCache: localStorage.getItem('fitgroup_cached_user_profile'),
    interactiveMs: Math.round(performance.now()),
    resources: performance.getEntriesByType('resource')
      .filter(r => /\.(js|css)$/.test(r.name))
      .map(r => ({ file: r.name.split('/').pop(), bytes: r.decodedBodySize })),
  }));
  if (!firstInstall.loginVisible || firstInstall.online || firstInstall.authCache !== null) {
    throw new Error('Empty-cache offline login page failed');
  }
  await page.evaluate(() => {
    localStorage.setItem('fitgroup_cached_user_profile', JSON.stringify({ id: 'stale', uid: 'stale', displayName: 'cached-user' }));
    localStorage.setItem('fitgroup-origin-check', 'old-origin');
  });
  await page.reload();
  await page.getByText('登录打卡', { exact: true }).waitFor();
  if (await page.getByText('cached-user', { exact: true }).count()) {
    throw new Error('Cached profile authenticated without a session');
  }
  await page.goto('http://localhost:4178');
  await page.getByText('登录打卡', { exact: true }).waitFor();
  const newOriginStorage = await page.evaluate(() => localStorage.getItem('fitgroup-origin-check'));
  if (newOriginStorage !== null) throw new Error('Cross-origin storage leaked');
  return { firstInstall, staleCacheWithoutSession: 'login-page', newOriginStorage };
}
