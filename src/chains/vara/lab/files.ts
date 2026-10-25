export function download(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readText(file: File, maxBytes = 2 * 1024 * 1024): Promise<string> {
  if (file.size > maxBytes) throw new Error(`File exceeds ${Math.round(maxBytes / 1024 / 1024)} MiB`);
  return file.text();
}

export const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
export const jsonText = (value: unknown) => JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v, 2);
