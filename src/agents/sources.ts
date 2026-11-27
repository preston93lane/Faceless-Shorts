/**
 * Which websites count as reputable sources for the Fact Checker's "two sources per claim" rule.
 * Code enforces this; the model is told the same list but is not trusted to apply it.
 */

/** Domain suffixes that are reputable by default (government science agencies, universities). */
const TRUSTED_SUFFIXES = [".gov", ".edu", ".ac.uk", ".edu.au", ".ac.jp", ".mil"];

/** Specific reputable publishers and journals (subdomains included). */
const TRUSTED_DOMAINS = [
  // Agencies and institutions outside .gov/.edu
  "nasa.gov", "esa.int", "si.edu", "nhm.ac.uk", "amnh.org", "who.int", "ipcc.ch", "cern.ch", "noaa.gov", "metoffice.gov.uk",
  // Encyclopedias and reference
  "britannica.com",
  // Journals and preprint servers
  "nature.com", "science.org", "sciencedirect.com", "springer.com", "wiley.com", "pnas.org", "cell.com", "aps.org",
  "aip.org", "iop.org", "royalsocietypublishing.org", "plos.org", "arxiv.org", "nih.gov", "frontiersin.org", "biorxiv.org",
  // Established science journalism and museums
  "nationalgeographic.com", "scientificamerican.com", "newscientist.com", "smithsonianmag.com", "livescience.com",
  "space.com", "phys.org", "sciencenews.org", "quantamagazine.org", "pbs.org", "bbc.co.uk", "bbc.com",
  "howstuffworks.com", "physicsworld.com",
];

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function isReputable(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  if (TRUSTED_SUFFIXES.some((s) => host.endsWith(s))) return true;
  return TRUSTED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Normalizes a URL so the same page compares equal (scheme, www, trailing slash, fragment). */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return `${host}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return url.trim();
  }
}

export const TRUSTED_LIST_FOR_PROMPT = [...TRUSTED_DOMAINS, ...TRUSTED_SUFFIXES.map((s) => `any *${s} site`)].join(", ");
