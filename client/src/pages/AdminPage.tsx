import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Film, Link2, LogOut, Mail, MousePointerClick, Trash2, TriangleAlert, Upload } from "lucide-react";
import {
  ApiError, ButtonSettings, LandingVideo, activateVideo, deleteVideo, getButtons, getToken,
  listVideos, login, retryVideo, saveButtons, setToken, updateVideo, uploadVideo,
} from "../api";

/* ---------- shared UI ---------- */
const field =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-[#2f6bff] focus:ring-4 focus:ring-[#2f6bff]/10";
const btn = "inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50";
const primary = `${btn} bg-[#2f6bff] text-white shadow-sm hover:bg-[#245ae0]`;
const ghost = `${btn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;
const danger = `${btn} border border-red-200 bg-white text-red-600 hover:bg-red-50`;

const Label: React.FC<{ children: React.ReactNode; hint?: string }> = ({ children, hint }) => (
  <label className="block">
    <span className="mb-1.5 block text-sm font-medium text-slate-800">{children}</span>
    {hint && <span className="mb-1.5 -mt-1 block text-xs text-slate-500">{hint}</span>}
  </label>
);

const Card: React.FC<{ icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode }> = ({
  icon, title, subtitle, children,
}) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="mb-5 flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2f6bff]/10 text-[#2f6bff]">{icon}</span>
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
    </div>
    {children}
  </section>
);

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

/** "12.4 MB → 3.1 MB (−75%)" once compressed; plain size for legacy videos. */
const sizeInfo = (v: LandingVideo) => {
  if (v.status !== "ready") return v.originalSize ? `Original ${mb(v.originalSize)}` : "";
  if (!v.originalSize) return mb(v.size);
  const pct = Math.round((1 - v.size / v.originalSize) * 100);
  return `${mb(v.originalSize)} → ${mb(v.size)} (${pct >= 0 ? `−${pct}` : `+${-pct}`}%)`;
};

/* ---------- login ---------- */
const Login: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setToken((await login(username, password)).token);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: "linear-gradient(180deg,#eaf4ff,#cfe4f9)" }}>
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-7 shadow-xl">
        <div className="space-y-1">
          <img src="/addmyco.png" alt="" className="mb-3 h-10 w-10 rounded-xl" />
          <h1 className="text-xl font-bold text-slate-900">Admin sign in</h1>
          <p className="text-sm text-slate-500">Manage the landing page video and buttons.</p>
        </div>
        <input className={field} placeholder="Username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <input className={field} type="password" placeholder="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button className={`${primary} w-full`} disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
};

/* ---------- Tab 1: video + its link ---------- */
const VideoRow: React.FC<{ v: LandingVideo; onChange: () => void; onError: (m: string) => void }> = ({ v, onChange, onError }) => {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(v.title);
  const [linkUrl, setLinkUrl] = useState(v.linkUrl);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); onChange(); } catch (e) { onError(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <li className={`flex flex-col gap-4 rounded-2xl border bg-white p-4 sm:flex-row ${v.isActive ? "border-[#2f6bff] ring-4 ring-[#2f6bff]/10" : "border-slate-200"}`}>
      {v.status === "ready" ? (
        <video src={v.videoUrl} controls preload="metadata" className="aspect-[9/16] h-52 shrink-0 self-center rounded-xl bg-black object-contain sm:self-start" />
      ) : (
        <div className="flex aspect-[9/16] h-52 shrink-0 flex-col items-center justify-center gap-2 self-center rounded-xl bg-slate-100 px-3 text-center text-xs text-slate-500 sm:self-start">
          {v.status === "processing" ? (
            <>
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-[#2f6bff]" />
              Compressing…
            </>
          ) : (
            <>
              <TriangleAlert size={22} className="text-red-500" />
              Compression failed
            </>
          )}
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-slate-900">{v.title || "Untitled video"}</h3>
          {v.status === "processing" ? (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">Processing</span>
          ) : v.status === "failed" ? (
            <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">Failed</span>
          ) : v.isActive ? (
            <span className="rounded-full bg-[#2f6bff] px-2.5 py-0.5 text-xs font-semibold text-white">Live on landing page</span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">Inactive</span>
          )}
        </div>
        <p className="text-xs text-slate-500">
          {[sizeInfo(v), `uploaded ${new Date(v.createdAt).toLocaleString()}`].filter(Boolean).join(" · ")}
        </p>
        {v.status === "failed" && v.error && (
          <p className="break-words rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{v.error} The original file is safe; you can retry.</p>
        )}

        {editing ? (
          <div className="space-y-3">
            <div><Label>Title</Label><input className={field} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div><Label hint="Opens when this video finishes playing.">Video link</Label>
              <input className={field} placeholder="https://…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} /></div>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
            <Link2 size={16} className="mt-0.5 shrink-0 text-slate-400" />
            <div className="min-w-0">
              <div className="text-xs font-medium text-slate-500">Video link (opens when video ends)</div>
              {v.linkUrl
                ? <a className="break-all text-[#2f6bff] underline" href={v.linkUrl} target="_blank" rel="noreferrer noopener">{v.linkUrl}</a>
                : <span className="text-slate-400">None — nothing happens when the video ends</span>}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <button className={primary} disabled={busy} onClick={() => run(async () => { await updateVideo(v._id, { title, linkUrl }); setEditing(false); })}>Save changes</button>
              <button className={ghost} disabled={busy} onClick={() => { setEditing(false); setTitle(v.title); setLinkUrl(v.linkUrl); }}>Cancel</button>
            </>
          ) : (
            <>
              {v.status === "failed" && <button className={primary} disabled={busy} onClick={() => run(() => retryVideo(v._id))}>Retry compression</button>}
              {v.status === "ready" && !v.isActive && <button className={primary} disabled={busy} onClick={() => run(() => activateVideo(v._id))}>Make live</button>}
              <button className={ghost} disabled={busy} onClick={() => setEditing(true)}>Edit</button>
              <button className={danger} disabled={busy} onClick={() => { if (confirm("Delete this video permanently?")) run(() => deleteVideo(v._id)); }}>
                <Trash2 size={15} /> Delete
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
};

const VideosTab: React.FC<{ onAuthLost: () => void }> = ({ onAuthLost }) => {
  const [videos, setVideos] = useState<LandingVideo[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [makeLive, setMakeLive] = useState(true);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try { setVideos((await listVideos()).data); }
    catch (e) {
      if (e instanceof ApiError && e.status === 401) { onAuthLost(); return; }
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); }
  }, [onAuthLost]);
  useEffect(() => { load(); }, [load]);

  // Poll while anything is being compressed so status/size update on their own.
  const anyProcessing = videos.some((v) => v.status === "processing");
  useEffect(() => {
    if (!anyProcessing) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [anyProcessing, load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Choose a video file first");
    setUploading(true);
    setError("");
    const fd = new FormData();
    fd.append("title", title);
    fd.append("linkUrl", linkUrl.trim());
    fd.append("setActive", String(makeLive));
    fd.append("video", file); // file last so text fields are parsed first
    try {
      await uploadVideo(fd);
      setTitle(""); setLinkUrl(""); setFileName("");
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Upload failed"); }
    finally { setUploading(false); }
  };

  return (
    <div className="space-y-6">
      {error && <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <Card icon={<Upload size={20} />} title="Upload a video" subtitle="A video and the link visitors are sent to when it ends. It is compressed automatically; your original is kept.">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Video file</Label>
            <button type="button" onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600 transition hover:border-[#2f6bff] hover:bg-[#2f6bff]/5">
              <Film size={22} className="text-slate-400" />
              <span className="font-medium">{fileName || "Click to choose a video"}</span>
              <span className="text-xs text-slate-400">MP4, WebM or MOV · portrait 9:16 works best</span>
            </button>
            <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden"
              onChange={(e) => setFileName(e.target.files?.[0]?.name || "")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label>Title (optional)</Label><input className={field} placeholder="e.g. November promo" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div><Label>Video link (optional)</Label><input className={field} placeholder="https://…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 accent-[#2f6bff]" checked={makeLive} onChange={(e) => setMakeLive(e.target.checked)} />
            Make this the live video as soon as compression finishes
          </label>
          <button className={primary} disabled={uploading}>{uploading ? "Uploading…" : "Upload video"}</button>
        </form>
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">All videos ({videos.length})</h2>
        {loading ? <p className="text-sm text-slate-500">Loading…</p>
          : videos.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
              No videos yet. The landing page is showing its built-in default video.
            </div>
          ) : <ul className="space-y-3">{videos.map((v) => <VideoRow key={v._id} v={v} onChange={load} onError={setError} />)}</ul>}
      </section>
    </div>
  );
};

/* ---------- Tab 2: buttons ---------- */
const ButtonsTab: React.FC<{ onAuthLost: () => void }> = ({ onAuthLost }) => {
  const [form, setForm] = useState<ButtonSettings>({ createLink: "", contactEmail: "" });
  const [saved, setSaved] = useState<ButtonSettings | null>(null);
  const [defaults, setDefaults] = useState<ButtonSettings | null>(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getButtons().then((r) => { setForm(r.data); setSaved(r.data); setDefaults(r.defaults); })
      .catch((e) => { if (e instanceof ApiError && e.status === 401) onAuthLost(); else setError(e.message); });
  }, [onAuthLost]);

  const dirty = saved && (form.createLink !== saved.createLink || form.contactEmail !== saved.contactEmail);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(""); setOk(false);
    try {
      const r = await saveButtons({ createLink: form.createLink.trim(), contactEmail: form.contactEmail.trim() });
      setForm(r.data); setSaved(r.data); setOk(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Save failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <Card icon={<MousePointerClick size={20} />} title="Landing page buttons" subtitle="These apply to the whole page, whichever video is live.">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label hint="Where the “Go to Create One” button sends visitors.">“Go to Create One” link</Label>
            <input className={field} placeholder="https://t.me/…" value={form.createLink} onChange={(e) => setForm({ ...form, createLink: e.target.value })} required />
          </div>
          <div>
            <Label hint="The “Contact us” button opens an email to this address.">“Contact us” email</Label>
            <input className={field} type="email" placeholder="name@company.com" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} required />
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {ok && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Saved. The landing page now uses these.</p>}
          <div className="flex flex-wrap gap-2">
            <button className={primary} disabled={busy || !dirty}>{busy ? "Saving…" : "Save buttons"}</button>
            {defaults && (
              <button type="button" className={ghost} onClick={() => { setForm(defaults); setOk(false); }}>Reset to defaults</button>
            )}
          </div>
        </form>
      </Card>

      {/* live mini preview of the two buttons */}
      <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</p>
        <div className="space-y-3 rounded-2xl p-4" style={{ background: "linear-gradient(180deg,#eaf4ff,#cfe4f9)" }}>
          <div className="flex items-center justify-center gap-2 rounded-xl bg-[#2f6bff] py-3 text-sm font-semibold text-white">
            Go to Create One <ArrowRight size={16} />
          </div>
          <div className="flex items-center justify-center gap-2 rounded-xl border-2 border-[#2f6bff] bg-white/80 py-2.5 text-sm font-semibold text-[#2f6bff]">
            <Mail size={16} /> Contact us
          </div>
        </div>
        <dl className="mt-3 space-y-1.5 break-all text-xs text-slate-500">
          <div><dt className="font-medium text-slate-700">Create →</dt><dd>{form.createLink || "—"}</dd></div>
          <div><dt className="font-medium text-slate-700">Email →</dt><dd>{form.contactEmail || "—"}</dd></div>
        </dl>
      </aside>
    </div>
  );
};

/* ---------- shell ---------- */
type Tab = "video" | "buttons";

const Dashboard: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const [tab, setTab] = useState<Tab>("video");
  const logout = () => { setToken(null); onLogout(); };
  const authLost = useCallback(() => { setToken(null); onLogout(); }, [onLogout]);

  const tabs: { id: Tab; label: string; sub: string; icon: React.ReactNode }[] = [
    { id: "video", label: "Video & link", sub: "What plays, and where it leads", icon: <Film size={18} /> },
    { id: "buttons", label: "Buttons", sub: "Create One & Contact us", icon: <MousePointerClick size={18} /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <img src="/addmyco.png" alt="" className="h-8 w-8 rounded-lg" />
            <h1 className="text-base font-bold text-slate-900">Landing page admin</h1>
          </div>
          <div className="flex gap-2">
            <a className={ghost} href="/" target="_blank" rel="noreferrer">View page</a>
            <button className={ghost} onClick={logout}><LogOut size={15} /> Log out</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <nav className="grid gap-3 sm:grid-cols-2" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${tab === t.id ? "border-[#2f6bff] bg-white shadow-sm ring-4 ring-[#2f6bff]/10" : "border-slate-200 bg-white/60 hover:bg-white"}`}>
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tab === t.id ? "bg-[#2f6bff] text-white" : "bg-slate-100 text-slate-500"}`}>{t.icon}</span>
              <span>
                <span className="block text-sm font-semibold text-slate-900">{t.label}</span>
                <span className="block text-xs text-slate-500">{t.sub}</span>
              </span>
            </button>
          ))}
        </nav>

        {tab === "video" ? <VideosTab onAuthLost={authLost} /> : <ButtonsTab onAuthLost={authLost} />}
      </main>
    </div>
  );
};

const AdminPage: React.FC = () => {
  const [authed, setAuthed] = useState(!!getToken());
  const onLogout = useCallback(() => setAuthed(false), []);
  return authed ? <Dashboard onLogout={onLogout} /> : <Login onDone={() => setAuthed(true)} />;
};

export default AdminPage;
