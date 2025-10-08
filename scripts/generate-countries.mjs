import fs from "node:fs"
import path from "node:path"

const ascii = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "")

;(async () => {
  const res = await fetch("https://restcountries.com/v3.1/all?fields=cca2,name")
  if (!res.ok) {
    throw new Error(`Failed to fetch countries: ${res.status}`)
  }

  const json = await res.json()
  const entries = json
    .filter(
      (item) =>
        typeof item.cca2 === "string" &&
        item.cca2.length === 2 &&
        item.name &&
        item.name.common
    )
    .map((item) => ({
      code: item.cca2.toUpperCase(),
      name: ascii(item.name.common),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const deduped = Array.from(new Map(entries.map((entry) => [entry.code, entry])).values())

  const fileContent = `export const COUNTRIES = ${JSON.stringify(deduped, null, 2)} as const;\n\nexport type CountryCode = typeof COUNTRIES[number]['code'];\n`

  const filePath = path.resolve("src/lib/countries.ts")
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, fileContent, "utf8")
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
