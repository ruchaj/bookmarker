// Shrinks a phone photo in the browser before upload: faster, cheaper to
// read, and well under the server's request-size limit.

const MAX_EDGE = 1568;

export async function preparePhoto(file: File): Promise<{ image: string; mediaType: "image/jpeg"; previewUrl: string }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  if (!bitmap) throw new Error("That file isn't a photo this browser can open. Try a JPEG or PNG.");

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { image: dataUrl.slice(dataUrl.indexOf(",") + 1), mediaType: "image/jpeg", previewUrl: dataUrl };
}

/** POST JSON to one of the app's API routes and return the parsed answer, or throw its error message. */
export async function postJson<T>(url: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !data) throw new Error(data?.error ?? "Something went wrong. Try again.");
  return data;
}
