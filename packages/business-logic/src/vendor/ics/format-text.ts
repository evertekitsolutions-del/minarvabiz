/**
 * Adapted from adamgibbons/ics src/utils/format-text.js (ISC).
 * Upstream: be80affe735f1c97d2c5e2801a9a4f826ff4b631. See adjacent LICENSE.
 * Changes: TypeScript signature; normalize lone CR as well as CRLF/LF.
 */
export default function formatText(text:string):string {
  return text
    .replace(/\\/gm, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/gm, "\\;")
    .replace(/,/gm, "\\,");
}
