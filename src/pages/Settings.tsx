import { useRef, useState } from "react";
import { GardenSettingsForm } from "@/components/forms";
import { useGarden } from "@/lib/GardenContext";
import { getApiKey, setApiKey } from "@/lib/settings";
import { exportBackup, importBackup, type Backup } from "@/lib/store";

export function SettingsPage() {
  const { db, data, today, reload } = useGarden();
  const [key, setKey] = useState(getApiKey() ?? "");
  const [keySaved, setKeySaved] = useState(false);
  const [backupMsg, setBackupMsg] = useState<{ ok?: string; error?: string }>();
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
    setBackupMsg({ ok: "Backup downloaded" });
  };

  const restore = async (file: File) => {
    if (!confirm("Replace everything on this device with the backup? Anything not in the backup is lost.")) return;
    try {
      await importBackup(db, JSON.parse(await file.text()) as Backup);
      await reload();
      setBackupMsg({ ok: "Backup restored" });
    } catch (e) {
      setBackupMsg({ error: (e as Error).message || "Couldn't read that file." });
    }
  };

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
          <p className="small muted">
            The assistant calls Claude directly from this browser with your Anthropic API key. The key is stored only on this
            device and isn&rsquo;t included in backups. Get one at{" "}
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>.
          </p>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              setApiKey(key.trim() || null);
              setKeySaved(true);
            }}
          >
            <input
              type="password"
              autoComplete="off"
              placeholder="sk-ant-…"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setKeySaved(false);
              }}
              style={{ flex: 1, minWidth: 200 }}
            />
            <button className="primary small">Save</button>
            {keySaved && <span className="ok">{key.trim() ? "Saved ✓" : "Removed ✓"}</span>}
          </form>
        </section>

        <section className="card">
          <h2>Your data</h2>
          <p className="small muted">
            Everything — plants, care log, notes and photos — is stored in this browser on this device. Nothing is uploaded.
            Download a backup now and then, and use it to move the garden to another phone or share it with another gardener.
          </p>
          <div className="row">
            <button className="primary small" onClick={download}>⬇️ Download backup</button>
            <button className="small" onClick={() => fileInput.current?.click()}>⬆️ Restore from backup…</button>
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
          {backupMsg?.ok && <p className="ok" style={{ marginTop: 8 }}>{backupMsg.ok} ✓</p>}
          {backupMsg?.error && <p className="error" style={{ marginTop: 8 }}>{backupMsg.error}</p>}
          <p className="small muted" style={{ marginTop: 12 }}>
            {data.plantings.length} plantings · {data.events.length} care entries · {data.notes.length} notes · {data.photos.filter((p) => !p.src).length} uploaded photos
          </p>
        </section>
      </div>
    </>
  );
}
