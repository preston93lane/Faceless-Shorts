/**
 * Checks one new illustration before it is used (Haiku 5.5 vision by default, a fraction of a cent). Catching a wrong picture
 * here costs one image; catching it after rendering costs a whole render and QA pass.
 */
import { z } from "zod";
import type { Llm } from "./llm";
import { route } from "./routing";

export const ImageCheckSchema = z.object({
  ok: z.boolean().describe("True if the picture shows the described subject accurately enough for a science video and fits the paper-cutout style."),
  problems: z.array(z.string()),
  betterDescription: z
    .string()
    .describe("If not ok: a rewritten description for the image model that avoids the problems (shape, parts, colors, count of legs/parts; no nicknames, nothing it could misread). If ok: empty."),
});
export type ImageCheck = z.infer<typeof ImageCheckSchema>;

const SYSTEM = `You check illustrations for Wonderscraps, a paper-cutout science channel for a general audience. Each picture should be a single subject cut out of layered colored paper with a white border.

Reject it (ok=false) ONLY for these blocking problems:
- the science is wrong: wrong number of legs or parts, wrong shape, parts that do not exist (a snout, horns or a tail on an animal that has none), or it looks like a different thing;
- it could be misread as a symbol it is not meant to be (an awareness ribbon, a cross, a logo, a flag);
- it looks like a photograph instead of cut paper, or has text, numbers or letters in it;
- it reads as made for small children (baby faces, blush cheeks on animals or objects, toddler proportions) or anything scary.
Everything else passes: facial expressions, poses, colors, how many paper layers show, and small style differences are NOT reasons to reject. A friendly simple face is fine where the subject has a face. When in doubt, pass it; the final video review catches the rest.`;

export async function checkImage(llm: Llm, png: Buffer, subject: { key: string; description: string }): Promise<ImageCheck> {
  return llm.structured({
    step: `image-check:${subject.key}`,
    ...route("imageCheck"),
    system: SYSTEM,
    user: `This illustration was generated from the description: "${subject.description}". Does it show that accurately?`,
    images: [{ mediaType: "image/png", data: png.toString("base64") }],
    schema: ImageCheckSchema,
  });
}
