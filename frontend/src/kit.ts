// The DS plugin-kit bridge (RULE 4): plugin-kit.js is an ES module served
// same-origin at <base>/_ds/plugin-kit.js. It owns the protoagent:init handshake
// (bearer + theme → --pl-* tokens) and slug-aware authed fetch — never hand-roll
// either. Falls back to a tokenless shim on an older host / standalone dev.

type Kit = {
  initPluginView: (onInit?: (msg: unknown) => void) => void;
  getToken?: () => string | null;
  apiFetch: (input: string, init?: RequestInit) => Promise<Response>;
};

declare global {
  interface Window {
    __base: string;
  }
}

export const BASE: string = window.__base ?? location.pathname.split("/plugins/")[0];

const kitPromise: Promise<Kit> = (async () => {
  try {
    const kit = (await import(/* @vite-ignore */ `${BASE}/_ds/plugin-kit.js`)) as Kit;
    kit.initPluginView();
    return kit;
  } catch {
    return {
      initPluginView() {},
      getToken: () => null,
      apiFetch: (p: string, i?: RequestInit) => fetch(BASE + p, i),
    };
  }
})();

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const kit = await kitPromise;
  return kit.apiFetch(path, init);
}
