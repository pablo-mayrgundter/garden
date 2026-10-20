import { useRef, useState } from "react";
import { GardenSettingsForm } from "@/components/forms";
import { useGarden } from "@/lib/GardenContext";
import { getAssistantSettings, OLLAMA_DEFAULTS, saveAssistantSettings } from "@/lib/settings";
import { exportBackup, importBackup, RECORD_STORES, type Backup } from "@/lib/store";

type Msg = { ok?: string; error?: string } | undefined;

function Status({ msg }: { msg: Msg }) {
  if (msg?.error) return <p className="error" style={{ marginTop: 8 }}>{msg.error}</p>;
  if (msg?.ok) return <p className="ok" style={{ marginTop: 8 }}>{msg.ok}</p>;
  return null;
}

function AssistantSettings() {
  const initial = getAssistantSettings();
  const [provider, setProviderState] = useState(initial.provider);
  const [key, setKeyState] = useState(initial.apiKey ?? "");
  const [url, setUrlState] = useState(initial.ollamaUrl);
  const [model, setModelState] = useState(initial.ollamaModel);
  const [models, setModels] = useState<string[] | null>(null);
  const [msg, setMsg] = useState<Msg>();

  // Changes save as you make them; there's nothing to forget to press.
  const setProvider = (v: typeof provider) => (setProviderState(v), saveAssistantSettings({ provider: v }));
  const setKey = (v: string) => (setKeyState(v), saveAssistantSettings({ apiKey: v.trim() || null }));
  const setUrl = (v: string) => (setUrlState(v), saveAssistantSettings({ ollamaUrl: v.trim() || OLLAMA_DEFAULTS.url }));
  const setModel = (v: string) => (setModelState(v), saveAssistantSettings({ ollamaModel: v.trim() || OLLAMA_DEFAULTS.model }));

  const test = async () => {
    setMsg(undefined);
    setModels(null);
    try {
      const { listOllamaModels } = await import("@/lib/assistant/ollama");
      const names = await listOllamaModels(url.trim() || OLLAMA_DEFAULTS.url);
      setModels(names);
      setMsg(
        names.includes(model.trim())
          ? { ok: `Connected ✓ — ${model} is available.` }
          : { error: `Connected, but ${model || "that model"} isn't pulled yet. Run: ollama pull ${model || OLLAMA_DEFAULTS.model}` },
      );
    } catch (e) {
      setMsg({ error: (e as Error).message });
    }
  };

  return (
    <form className="form" onSubmit={(e) => e.preventDefault()}>
      <div className="row">
        <label className="inline"><input type="radio" name="provider" checked={provider === "claude"} onChange={() => setProvider("claude")} /> Claude (API key)</label>
        <label className="inline"><input type="radio" name="provider" checked={provider === "ollama"} onChange={() => setProvider("ollama")} /> Local model (Ollama)</label>
      </div>

      {provider === "claude" ? (
        <>
          <p className="small muted" style={{ margin: 0 }}>
            Calls Claude directly from this browser with your Anthropic API key, created in a workspace at{" "}
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">the Claude Console</a>.
          </p>
          <input type="password" autoComplete="off" placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} />
        </>
      ) : (
        <>
          <p className="small muted" style={{ margin: 0 }}>
            Talks to an <a href="https://ollama.com" target="_blank" rel="noreferrer">Ollama</a> server from this browser. Nothing leaves your network.
          </p>
          <div className="form-grid">
            <label>Server<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={OLLAMA_DEFAULTS.url} /></label>
            <label>
              Model
              <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={OLLAMA_DEFAULTS.model} list="ollama-models" />
              <datalist id="ollama-models">{models?.map((m) => <option key={m} value={m} />)}</datalist>
            </label>
          </div>
          <details>
            <summary>Setting up Ollama for this site</summary>
            <div className="small">
              <p>Ollama only answers web pages it&rsquo;s told to trust. Start it with this site&rsquo;s address allowed:</p>
              <pre className="code">{`OLLAMA_ORIGINS="${location.origin}" ollama serve`}</pre>
              <p>
                On a Mac using the Ollama app, instead run{" "}
                <code>{`launchctl setenv OLLAMA_ORIGINS "${location.origin}"`}</code> and restart Ollama. Then make sure the model is
                there: <code>ollama pull {model || OLLAMA_DEFAULTS.model}</code>.
              </p>
              <p>
                Use Chrome, Edge or Firefox on the same computer as Ollama. Chrome may ask to let this site reach devices on your local
                network; allow it. Safari blocks secure sites from talking to <code>http://localhost</code>; there, run the app locally
                instead (<code>npm run dev</code>).
              </p>
            </div>
          </details>
        </>
      )}
      <div className="row">
        <span className="small muted">Saved on this device as you type.</span>
        {provider === "ollama" && <button type="button" className="small" onClick={test}>Test connection</button>}
      </div>
      <Status msg={msg} />
    </form>
  );
}

export function SettingsPage() {
  const { db, data, today, reload } = useGarden();
  const [backupMsg, setBackupMsg] = useState<Msg>();
  const fileInput = useRef<HTMLInputElement>(null);

  const download = async () => {
    const backup = await exportBackup(db);
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.garden.name.toLowerCase().replace(/\W+/g, "-")}-${today}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    // Revoking right away can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setBackupMsg({ ok: "Garden file downloaded ✓" });
  };

  const restore = async (file: File) => {
    if (!confirm("Replace everything in this browser with this garden file? Anything not in the file is lost.")) return;
    try {
      await importBackup(db, JSON.parse(await file.text()) as Backup);
      await reload();
      setBackupMsg({ ok: "Garden loaded ✓" });
    } catch (e) {
      setBackupMsg({ error: (e as Error).message || "Couldn't read that file." });
    }
  };

  const wipe = async () => {
    if (!confirm("Delete this garden from this browser? Download a garden file first if you want to keep it.")) return;
    const stores = ["meta", "photoBlobs", "chat", ...RECORD_STORES];
    const tx = db.transaction(stores, "readwrite");
    await Promise.all([...stores.map((s) => tx.objectStore(s).clear()), tx.done]);
    location.reload();
  };

  const uploaded = data.photos.length;
  return (
    <>
      <div className="page-head">
        <h1>Settings</h1>
      </div>
      <div className="grid cols-2">
        <section className="card">
          <h2>Garden</h2>
          <GardenSettingsForm />
        </section>

        <section className="card">
          <h2>Garden assistant</h2>
          <AssistantSettings />
        </section>

        <section className="card">
          <h2>Garden file</h2>
          <p className="small muted">
            Your garden — planters, plants, care log, notes, photos and assistant chats — lives only in this browser on this device.
            Download it as one file to back it up, or to open it on another phone, computer or copy of the app. Settings like the API key
            stay on each device.
          </p>
          <div className="row">
            <button className="primary small" onClick={download}>⬇️ Download garden file</button>
            <button className="small" onClick={() => fileInput.current?.click()}>⬆️ Open a garden file…</button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) restore(f);
              }}
            />
          </div>
          <Status msg={backupMsg} />
          <p className="small muted" style={{ marginTop: 12 }}>
            {data.trays.length} planters · {data.plantings.length} plantings · {data.events.length} care entries · {data.notes.length} notes · {uploaded} photos
          </p>
          <details style={{ marginTop: 8 }}>
            <summary>Remove this garden from this browser</summary>
            <button className="small danger" onClick={wipe}>Delete garden from this browser</button>
          </details>
        </section>
      </div>
    </>
  );
}
