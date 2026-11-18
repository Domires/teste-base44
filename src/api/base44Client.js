// Cliente com a MESMA interface do SDK do Base44 (@base44/sdk), apontando para o backend Node.js local.
//
// Ao migrar para o Base44, troque este arquivo por:
//   import { createClient } from "@base44/sdk";
//   import { getAppParams } from "@/lib/app-params";
//   const { appId, token, functionsVersion, appBaseUrl } = getAppParams();
//   export const base44 = createClient({ appId, token: token ?? undefined, functionsVersion, serverUrl: "", appBaseUrl });
// O restante do código usa apenas: base44.auth.*, base44.entities.<Entidade>.*, base44.functions.invoke e
// base44.integrations.Core.UploadFile — todos existentes no SDK.

// SOMENTE LOCAL: simula "quem está logado". No Base44 o usuário já vem autenticado pela plataforma (SSO);
// não existe tela de login no app. O seletor "Usuário de teste" (AppShell) grava o e-mail aqui.
const DEV_USER_KEY = "sol_grd_sgi_dev_user";
export const devUser = {
  get() {
    try {
      return localStorage.getItem(DEV_USER_KEY);
    } catch {
      return null;
    }
  },
  set(email) {
    try {
      if (email) localStorage.setItem(DEV_USER_KEY, email);
      else localStorage.removeItem(DEV_USER_KEY);
    } catch {
      /* armazenamento indisponível */
    }
  },
};

export class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request(method, url, body) {
  const dev = devUser.get();
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(dev ? { "X-Dev-User": dev } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Sem conexão com o servidor. Verifique sua internet e tente novamente.");
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.message || `Erro ${res.status}`, data);
  }
  return data;
}

function entity(name) {
  const base = `/api/entities/${name}`;
  const qs = (q, sort, limit) => {
    const p = new URLSearchParams();
    if (q && Object.keys(q).length) p.set("q", JSON.stringify(q));
    if (sort) p.set("sort", sort);
    if (limit) p.set("limit", String(limit));
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const args = (a, b) => (a && typeof a === "object" ? [a.sort, a.limit] : [a, b]);
  return {
    list: (sort, limit) => request("GET", base + qs({}, ...args(sort, limit))),
    filter: (query, sort, limit) => request("GET", base + qs(query, ...args(sort, limit))),
    get: (id) => request("GET", `${base}/${encodeURIComponent(id)}`),
    create: (data) => request("POST", base, data),
    bulkCreate: (list) => request("POST", base, list),
    update: (id, data) => request("PUT", `${base}/${encodeURIComponent(id)}`, data),
    delete: (id) => request("DELETE", `${base}/${encodeURIComponent(id)}`),
  };
}

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

export const base44 = {
  // Ambiente local (não existe no SDK): habilita o seletor "Usuário de teste".
  isLocal: true,
  auth: {
    me: () => request("GET", "/api/auth/me"),
    updateMe: (data) => request("PUT", "/api/auth/me", data),
    // No Base44 encerra a sessão da plataforma; localmente apenas recarrega a página.
    logout() {
      if (typeof window !== "undefined") window.location.href = "/";
    },
  },
  entities: new Proxy({}, { get: (_, name) => (typeof name === "string" ? entity(name) : undefined) }),
  functions: {
    // Mesmo formato do SDK: retorna { data }
    invoke: (name, payload) => request("POST", `/api/functions/${encodeURIComponent(name)}`, payload ?? {}),
  },
  integrations: {
    Core: {
      // Aceita { file } (File/Blob) ou { dataUrl }. Retorna { file_url }.
      async UploadFile({ file, dataUrl, fileName }) {
        const url = dataUrl || (await fileToDataUrl(file));
        return request("POST", "/api/integrations/Core/UploadFile", { dataUrl: url, fileName: fileName || file?.name });
      },
    },
  },
};
