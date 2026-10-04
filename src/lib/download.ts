// #71 (3 Oct). A customer who uses several assistants asked to export a
// conversation, because she will not explain her business twice. Taking it
// with her means a file she can keep, not a screen she can read.
//
// Two ways out, and which one is right depends on the device rather than on
// us. On a phone the file belongs in the share sheet: a PWA has no visible
// downloads folder, and a file that lands somewhere the person cannot find
// has not been exported. Everywhere else an anchor with `download` puts it
// where that browser puts files, which is where they will look for it.
//
// The sheet is tried first and only when the browser says it can take this
// exact file — `canShare` with the file itself, not a guess from the user
// agent, because the same browser answers differently for different types.

export type SaveOutcome = "shared" | "downloaded" | "cancelled";

export async function saveTextFile(
  filename: string,
  text: string,
  mime = "text/plain",
): Promise<SaveOutcome> {
  return saveFile(new File([text], filename, { type: `${mime};charset=utf-8` }));
}

// #894: the worked list arrives as bytes rather than text, and wants the
// same two ways out. The decision about sheet or download is the file's, not
// the caller's, so it lives in one place.
export async function saveBlob(filename: string, blob: Blob): Promise<SaveOutcome> {
  return saveFile(new File([blob], filename, { type: blob.type || "application/octet-stream" }));
}

async function saveFile(file: File): Promise<SaveOutcome> {
  const filename = file.name;

  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch {
      // The person closed the sheet. That is a decision, not a failure, and
      // quietly downloading the file instead would override it.
      return "cancelled";
    }
  }

  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick, not immediately: some browsers read the blob
  // after the click returns, and revoking first gives an empty file.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
