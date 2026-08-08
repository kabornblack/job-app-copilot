import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { searchJooble } from "../src/lib/jooble";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", "..", "..", ".env"), override: true });

const locations = ["London", "Estonia", "United Kingdom", "Berlin", ""];

for (const loc of locations) {
  const r = await searchJooble({
    skills: ["TypeScript"],
    targetRoles: ["Software Engineer"],
    locations: loc ? [loc] : [],
    remotePref: "any",
  });
  console.log(
    JSON.stringify({
      loc: loc || "(empty)",
      count: r.jobs.length,
      first: r.jobs[0]
        ? {
            title: r.jobs[0].title,
            company: r.jobs[0].company,
            location: r.jobs[0].location,
            id: r.jobs[0].externalId,
          }
        : null,
    }),
  );
}
