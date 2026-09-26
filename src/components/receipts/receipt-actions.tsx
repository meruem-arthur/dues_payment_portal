"use client";

import { useState } from "react";

export function ReceiptActions({
  downloadUrl,
  fileName,
}: {
  downloadUrl: string;
  fileName: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);

    // Open the tab synchronously, inside the click handler, so mobile
    // browsers don't treat it as an unsolicited popup once the fetch
    // below resolves asynchronously. We point it at the real PDF once
    // we have it.
    const viewer = window.open("", "_blank");

    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error("Could not load receipt");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      if (viewer) {
        viewer.location.href = blobUrl;
      } else {
        // Popup was blocked outright - fall back to opening it ourselves.
        window.open(blobUrl, "_blank");
      }

      // Trigger a save-to-device download of the same file in the background.
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Give the new tab and the download time to actually read the blob
      // before we release it.
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err) {
      viewer?.close();
      setError(err instanceof Error ? err.message : "Could not open receipt");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button onClick={handleClick} disabled={loading} className="portal-btn-primary inline-block">
        {loading ? "Opening..." : "View & Download Receipt (PDF)"}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
