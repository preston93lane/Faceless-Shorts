/** Splits narration into sentences. Shared by the voice (one synthesis per sentence) and the storyboard (shots start on sentences). */
export function splitSentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
}
