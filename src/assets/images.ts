/**
 * Asset Generator: paper-cutout illustrations from fal.ai, cut out on a transparent background and kept in
 * a reusable library so each subject is paid for once.
 *
 *   - Model: FLUX.1 [dev] (fal-ai/flux/dev), about $0.025 per image. Compared with [schnell] on 2026-11-27:
 *     dev gives real layered paper, a clean white cut edge and better anatomy; schnell looked flat and small.
 *   - Background removal: BiRefNet (fal-ai/birefnet). It keeps the white paper border.
 *   - Results come back inline (sync_mode) because fal's file CDN is not reachable from every environment.
 *   - Library: public/assets/library/<key>.png plus index.json. Reuse is by key (a kebab-case subject name).
 *
 *   npx tsx src/assets/images.ts <key> "<description>"     # generate one (or show the cached one)
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import type { CostLedger } from "../agents/llm";

export const LIBRARY_DIR = "public/assets/library";
const INDEX = join(LIBRARY_DIR, "index.json");

/** Locked brand style for every illustration (docs/BRAND.md, "Paper Cutout"). */
export const IMAGE_STYLE =
  "Handmade paper cutout craft illustration made of layered colored construction paper pieces, each piece a flat saturated color with visible paper fiber texture and tiny cut-edge shadows. A thick clean white paper border surrounds the whole cut-out shape like a sticker. Single subject centered, isolated on a plain flat light grey background. No text, no letters, no numbers, no logos, no frame.";

export const IMAGE_MODEL = "fal-ai/flux/dev";
export const BG_MODEL = "fal-ai/birefnet";
/** USD per image (FLUX dev ~$0.025 per megapixel at 1024x1024) and per cut-out. */
export const IMAGE_PRICE = { generate: 0.025, cutout: 0.002 };

export type LibraryEntry = { key: string; description: string; file: string; model: string; seed: number; createdAt: string };
export type Library = Record<string, LibraryEntry>;

export async function loadLibrary(): Promise<Library> {
  return existsSync(INDEX) ? (JSON.parse(await readFile(INDEX, "utf8")) as Library) : {};
}

export function keyOf(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/** Calls a fal model synchronously. Injected in tests. */
export type FalCall = (model: string, input: Record<string, unknown>) => Promise<unknown>;

export const falCall: FalCall = async (model, input) => {
  const res = await fetch(`https://fal.run/${model}`, {
    method: "POST",
    // In Claude Code cloud sessions the proxy injects the real key; elsewhere set FAL_KEY.
    headers: { Authorization: `Key ${process.env.FAL_KEY ?? "proxy-injected"}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`${model}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
};

function dataUriBytes(uri: string): Buffer {
  const m = /^data:[^;]+;base64,(.*)$/s.exec(uri);
  if (!m) throw new Error("expected an inline (data URI) image; is sync_mode on?");
  return Buffer.from(m[1], "base64");
}

/**
 * Returns the library entry for a subject, generating it if needed. Returns null if generation fails
 * (offline, out of credit), so the video can still render with a drawn placeholder.
 */
export async function getImage(
  subject: { key: string; description: string },
  opts: {
    call?: FalCall;
    ledger?: CostLedger;
    log?: (l: string) => void;
    seed?: number;
    /** Checks a new picture; a rejection is regenerated from the suggested description (up to `attempts` tries). */
    verify?: (png: Buffer, subject: { key: string; description: string }) => Promise<{ ok: boolean; betterDescription?: string; problems?: string[] }>;
    attempts?: number;
  } = {},
): Promise<LibraryEntry | null> {
  const call = opts.call ?? falCall;
  const log = opts.log ?? ((l: string) => console.error(l));
  const key = keyOf(subject.key);
  const lib = await loadLibrary();
  if (lib[key] && existsSync(join("public", lib[key].file))) return lib[key];

  let description = subject.description;
  const attempts = opts.verify ? (opts.attempts ?? 3) : 1;
  try {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
      const png = await generateCutout(call, description, seed);
      opts.ledger?.add({ step: `image:${key}`, model: IMAGE_MODEL, inputTokens: 0, outputTokens: 0, webSearches: 0, usd: IMAGE_PRICE.generate + IMAGE_PRICE.cutout });
      if (opts.verify && attempt < attempts) {
        const v = await opts.verify(png, { key, description });
        if (!v.ok) {
          log(`image: ${key} rejected (${(v.problems ?? []).join("; ")}); retrying`);
          if (v.betterDescription) description = v.betterDescription;
          continue;
        }
      }
      return await saveEntry(key, description, png, seed, log);
    }
    return null;
  } catch (e) {
    // A budget stop must end the run, not quietly fall back to a placeholder.
    if (e instanceof Error && e.name === "OverBudget") throw e;
    log(`image: ${key} failed (${e instanceof Error ? e.message : String(e)}); the shot uses a drawn placeholder`);
    return null;
  }
}

/** Generates one picture, cuts it out and trims it. */
async function generateCutout(call: FalCall, description: string, seed: number): Promise<Buffer> {
  const gen = (await call(IMAGE_MODEL, {
    prompt: `${description.replace(/\.$/, "")}. ${IMAGE_STYLE}`,
    image_size: "square_hd",
    num_inference_steps: 28,
    num_images: 1,
    seed,
    sync_mode: true,
    output_format: "png",
    enable_safety_checker: true,
  })) as { images: { url: string }[] };
  const raw = dataUriBytes(gen.images[0].url);
  const cut = (await call(BG_MODEL, {
    image_url: `data:image/png;base64,${raw.toString("base64")}`,
    sync_mode: true,
    output_format: "png",
  })) as { image: { url: string } };
  // Trim the transparent margin so templates can size the subject itself, and keep files small.
  return sharp(dataUriBytes(cut.image.url)).trim({ threshold: 1 }).resize(900, 900, { fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer();
}

/** Library writes are serialized so parallel generations never drop each other's index entries. */
let indexLock: Promise<unknown> = Promise.resolve();

async function saveEntry(key: string, description: string, png: Buffer, seed: number, log: (l: string) => void): Promise<LibraryEntry> {
  await mkdir(LIBRARY_DIR, { recursive: true });
  const file = `assets/library/${key}.png`;
  await writeFile(join("public", file), png);
  const entry: LibraryEntry = { key, description, file, model: IMAGE_MODEL, seed, createdAt: new Date().toISOString().slice(0, 10) };
  const write = indexLock.then(async () => {
    const fresh = await loadLibrary();
    fresh[key] = entry;
    await writeFile(INDEX, `${JSON.stringify(sortKeys(fresh), null, 2)}\n`);
  });
  indexLock = write.catch(() => undefined);
  await write;
  log(`image: generated ${key}`);
  return entry;
}

/** Removes a library image so the next getImage regenerates it (used when QA rejects a picture). */
export async function forgetImage(key: string): Promise<void> {
  const lib = await loadLibrary();
  delete lib[keyOf(key)];
  await writeFile(INDEX, `${JSON.stringify(sortKeys(lib), null, 2)}\n`);
}

function sortKeys(lib: Library): Library {
  return Object.fromEntries(Object.entries(lib).sort(([a], [b]) => a.localeCompare(b)));
}

const isMain = process.argv[1]?.endsWith("images.ts");
if (isMain) {
  const [key, description] = process.argv.slice(2);
  if (!key || !description) {
    console.error('Usage: npx tsx src/assets/images.ts <key> "<description>"');
    process.exit(1);
  }
  const e = await getImage({ key, description });
  console.log(e ? `public/${e.file}` : "failed");
}
