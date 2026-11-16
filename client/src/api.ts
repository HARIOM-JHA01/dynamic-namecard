export interface LandingVideo {
  _id: string;
  title: string;
  videoUrl: string;
  /** Where visitors are sent when this video ends (optional). */
  linkUrl: string;
  isActive: boolean;
  /** processing = being compressed; failed = see `error`, can be retried. */
  status: "processing" | "ready" | "failed";
  error: string;
  /** Compressed size (bytes). */
  size: number;
  /** Size of the untouched original (0 for videos uploaded before compression existed). */
  originalSize: number;
  createdAt: string;
}

/** Site-wide button targets, independent of any video. */
export interface ButtonSettings {
  createLink: string;
  contactEmail: string;
}

export const DEFAULT_BUTTONS: ButtonSettings = {
  createLink: "https://t.me/AddmycoBot",
  contactEmail: "Office@addmy.co",
};
export const FALLBACK_VIDEO = { videoUrl: "/welcome-video.mp4", linkUrl: "" };

const TOKEN_KEY = "admin_token";
export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
export const setToken = (t: string | null) => {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
};

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const res = await fetch(url, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.message || `Request failed (${res.status})`, res.status);
  return body as T;
}

export const fetchLanding = async (): Promise<{
  video: { videoUrl: string; linkUrl: string };
  buttons: ButtonSettings;
}> => {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const body = await fetch("/api/landing", { signal: ctrl.signal }).then((r) => r.json());
    clearTimeout(t);
    if (body?.success) {
      return {
        video: body.video
          ? { videoUrl: body.video.videoUrl, linkUrl: body.video.linkUrl || "" }
          : FALLBACK_VIDEO,
        buttons: body.buttons || DEFAULT_BUTTONS,
      };
    }
  } catch { /* fall through */ }
  return { video: FALLBACK_VIDEO, buttons: DEFAULT_BUTTONS };
};

export const login = (username: string, password: string) =>
  request<{ token: string; username: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

export const listVideos = () => request<{ data: LandingVideo[] }>("/api/admin/videos");

export const uploadVideo = (form: FormData) =>
  request<{ data: LandingVideo }>("/api/admin/videos", { method: "POST", body: form });

export const updateVideo = (id: string, patch: Partial<Pick<LandingVideo, "title" | "linkUrl">>) =>
  request<{ data: LandingVideo }>(`/api/admin/videos/${id}`, { method: "PATCH", body: JSON.stringify(patch) });

export const activateVideo = (id: string) =>
  request<{ data: LandingVideo }>(`/api/admin/videos/${id}/activate`, { method: "POST" });

export const retryVideo = (id: string) =>
  request<{ data: LandingVideo }>(`/api/admin/videos/${id}/retry`, { method: "POST" });

export const deleteVideo = (id: string) =>
  request<{ success: boolean }>(`/api/admin/videos/${id}`, { method: "DELETE" });

export const getButtons = () =>
  request<{ data: ButtonSettings; defaults: ButtonSettings }>("/api/admin/settings");

export const saveButtons = (b: ButtonSettings) =>
  request<{ data: ButtonSettings }>("/api/admin/settings", { method: "PUT", body: JSON.stringify(b) });
