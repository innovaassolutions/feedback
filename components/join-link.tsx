import QRCode from "qrcode";

/** The join link for a session's interview, and its QR code for the last slide. */
export async function JoinLink({ url }: { url: string }) {
  // Dark modules take the text color and the quiet zone is transparent, so the container's
  // theme colors decide how it looks. A QR code needs dark on light to scan, hence bg-white.
  const svg = (await QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#000000ff", light: "#ffffff00" } }))
    .replace(/#000000(ff)?/gi, "currentColor")
    .replace(/#ffffff(00)?/gi, "transparent");
  return (
    <div className="flex flex-wrap items-center gap-6" data-testid="join-link">
      <div
        className="h-40 w-40 shrink-0 rounded-theme bg-white p-2 text-black"
        role="img"
        aria-label="QR code for the feedback link"
        data-testid="join-qr"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="min-w-0 space-y-2">
        <p className="text-sm text-muted">Put this on the last slide. Learners scan it to give feedback.</p>
        <p className="break-all font-mono text-sm">
          <a href={url}>{url}</a>
        </p>
      </div>
    </div>
  );
}
