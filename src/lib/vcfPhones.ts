// Launch day, 21 Oct (Misho; Ninia's „0 saved, 1 skipped" four times): the
// server skips every TEL that does not start with „+", and many Georgians save
// numbers in the local form. Until the server's own fix (backend a5d126fc)
// deploys, the upload rewrites each TEL value to the international form first.
// Once it does, this is harmless double safety.
//
// Only the value of TEL lines changes. Names, every other field, line endings
// and the number of contacts stay exactly as they were. A value the rules do
// not recognise (a bare foreign number, an extension, letters) is left as it
// was, and the server still decides about it.

const TEL_LINE = /^((?:[^:\r\n]*\.)?TEL(?:;[^:\r\n]*)?:)(tel:)?(.*?)(\r?)$/i;

export function normalizePhone(raw: string): string {
  const compact = raw.trim().replace(/[\s\-.()]/g, "");
  if (compact.startsWith("+")) return raw;
  if (!/^\d+$/.test(compact)) return raw;
  if (/^\d{9}$/.test(compact)) return `+995${compact}`;
  if (/^0\d{9}$/.test(compact)) return `+995${compact.slice(1)}`;
  if (/^995\d{9}$/.test(compact)) return `+${compact}`;
  if (/^00\d+$/.test(compact)) return `+${compact.slice(2)}`;
  return raw;
}

export function normalizeVcfPhones(vcf: string): string {
  return vcf
    .split("\n")
    .map((line) => {
      const m = TEL_LINE.exec(line);
      if (!m) return line;
      const [, head, uri = "", value, cr] = m;
      const next = normalizePhone(value);
      return next === value ? line : `${head}${uri}${next}${cr}`;
    })
    .join("\n");
}
