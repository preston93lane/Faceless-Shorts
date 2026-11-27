/**
 * Uploads finished videos and their review notes to the owner's Dropbox review folder.
 * Needs the Dropbox app from Phase 0 (docs/PLAN.md §6): DROPBOX_APP_KEY, DROPBOX_APP_SECRET and
 * DROPBOX_REFRESH_TOKEN. Without them, uploading is skipped and the files stay in out/videos/.
 *
 * DROPBOX_ROOT is the folder inside the app's view of Dropbox ("/Wonderscraps" for a full-Dropbox app;
 * "" for an App-folder app whose folder is the Wonderscraps folder itself).
 */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

export const REVIEW_FOLDER = "01 Review";

export function dropboxConfigured(): boolean {
  return Boolean(process.env.DROPBOX_APP_KEY && process.env.DROPBOX_APP_SECRET && process.env.DROPBOX_REFRESH_TOKEN);
}

async function accessToken(): Promise<string> {
  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: process.env.DROPBOX_REFRESH_TOKEN ?? "",
      client_id: process.env.DROPBOX_APP_KEY ?? "",
      client_secret: process.env.DROPBOX_APP_SECRET ?? "",
    }),
  });
  if (!res.ok) throw new Error(`Dropbox token refresh failed: HTTP ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** Dropbox-API-Arg must be ASCII; escape everything else as \\uXXXX. */
export function apiArg(obj: unknown): string {
  return JSON.stringify(obj).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

export function reviewPath(fileName: string): string {
  const root = (process.env.DROPBOX_ROOT ?? "/Wonderscraps").replace(/\/$/, "");
  return `${root}/${REVIEW_FOLDER}/${fileName}`;
}

/** Uploads files (up to 150 MB each) into the review folder, overwriting same-named files. Returns the Dropbox paths. */
export async function uploadForReview(localFiles: string[]): Promise<string[]> {
  const token = await accessToken();
  const out: string[] = [];
  for (const f of localFiles) {
    const path = reviewPath(basename(f));
    const res = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": apiArg({ path, mode: "overwrite", mute: false }),
      },
      body: new Uint8Array(await readFile(f)),
    });
    if (!res.ok) throw new Error(`Dropbox upload of ${basename(f)} failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    out.push(path);
  }
  return out;
}
