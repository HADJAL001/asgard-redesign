import { readFile } from "node:fs/promises"

const source = await readFile(new URL("../components/cofounder/CofounderConsole.tsx", import.meta.url), "utf8")

const interviewStart = source.indexOf('<section className="ds-interview"')
const interviewEnd = source.indexOf("</section>", interviewStart)
const interview = source.slice(interviewStart, interviewEnd)

if (interviewStart < 0 || interviewEnd < 0 || (interview.match(/<input\b/g) || []).length !== 3) {
  throw new Error("Cofounder interview must contain exactly three inputs")
}

if (!source.includes('body: JSON.stringify({ brief: normalizedBrief })')) {
  throw new Error("AI compiler must receive the normalized three-question brief")
}

if (source.includes('textarea required rows={4} value={brief}')) {
  throw new Error("Contract dialog must not restore a duplicate brief textarea")
}

console.log("cofounder-interview-guard:ok")
