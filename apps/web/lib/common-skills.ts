/**
 * Static local data for the Skills tab's autocomplete
 * (apps/web/app/components/profile/SkillsTab.tsx): skill-name suggestions,
 * canonical category suggestions, and a name -> category lookup used to
 * auto-fill category when a known skill name is picked. Purely a typing aid
 * via native <datalist> elements — no API call, no cost, and freeform entry
 * of anything not on these lists is always allowed for both fields.
 */

export type SkillCategory =
  | "Languages"
  | "Frameworks & Libraries"
  | "Cloud & DevOps"
  | "Databases"
  | "Data & ML"
  | "Tools & Platforms"
  | "Security"
  | "Soft Skills";

/** Canonical, display-ordered list of categories offered as suggestions. */
export const SKILL_CATEGORIES: SkillCategory[] = [
  "Languages",
  "Frameworks & Libraries",
  "Cloud & DevOps",
  "Databases",
  "Data & ML",
  "Tools & Platforms",
  "Security",
  "Soft Skills",
];

export const SKILLS_BY_CATEGORY: Record<SkillCategory, string[]> = {
  Languages: [
    "JavaScript", "TypeScript", "Python", "Java", "C", "C++", "C#", "Go",
    "Rust", "Ruby", "PHP", "Swift", "Kotlin", "Scala", "R", "MATLAB",
    "Perl", "Objective-C", "Dart", "Elixir", "Haskell", "Lua", "SQL",
    "HTML", "CSS", "Bash", "PowerShell",
  ],
  "Frameworks & Libraries": [
    "React", "Next.js", "Vue.js", "Nuxt.js", "Angular", "Svelte",
    "SvelteKit", "Redux", "Zustand", "Tailwind CSS", "Sass", "Webpack",
    "Vite", "jQuery", "Bootstrap", "Material UI", "Radix UI", "shadcn/ui",
    "Framer Motion", "GraphQL", "Apollo Client", "Node.js", "Express",
    "Fastify", "NestJS", "Django", "Flask", "FastAPI", "Spring Boot",
    "Ruby on Rails", "Laravel", "ASP.NET", "gRPC", "WebSockets",
    "React Native", "Flutter",
  ],
  "Cloud & DevOps": [
    "AWS", "Azure", "Google Cloud Platform", "Docker", "Kubernetes",
    "Terraform", "CI/CD", "GitHub Actions", "Jenkins", "Ansible",
    "Nginx", "Linux Administration", "Serverless", "Cloudflare",
  ],
  Databases: [
    "PostgreSQL", "MySQL", "SQLite", "MongoDB", "Redis", "Elasticsearch",
    "DynamoDB", "Cassandra", "Neo4j", "Supabase", "Firebase",
    "Drizzle ORM", "Prisma", "SQLAlchemy",
  ],
  "Data & ML": [
    "Machine Learning", "Deep Learning", "Data Analysis", "Data Engineering",
    "Pandas", "NumPy", "TensorFlow", "PyTorch", "scikit-learn",
    "Natural Language Processing", "Computer Vision", "ETL Pipelines",
    "Apache Spark", "Airflow", "Power BI", "Tableau", "Excel",
  ],
  "Tools & Platforms": [
    "Git", "GitHub", "GitLab", "Jira", "Confluence", "Agile", "Scrum",
    "Kanban", "Test-Driven Development", "Unit Testing", "Vitest", "Jest",
    "Cypress", "Playwright", "Figma", "Postman", "GraphQL API Design",
    "REST API Design", "iOS Development", "Android Development",
  ],
  Security: [
    "Application Security", "Penetration Testing", "OWASP", "OAuth",
    "Cybersecurity", "Cryptography",
  ],
  "Soft Skills": [
    "Project Management", "Product Management", "Technical Writing",
    "Public Speaking", "Team Leadership", "Mentoring",
    "Stakeholder Management", "Cross-functional Collaboration",
    "Problem Solving", "Communication",
  ],
};

/** Flat name list for the Skill-name <datalist> — derived, not hand-kept. */
export const COMMON_SKILLS: string[] = Object.values(SKILLS_BY_CATEGORY).flat();

/**
 * Lowercased skill name -> its known category, for auto-filling the
 * Category field when a recognized skill name is entered. Lowercased keys
 * so lookup is case-insensitive ("react" and "React" both resolve).
 */
export const SKILL_CATEGORY_BY_NAME: Record<string, SkillCategory> = Object.entries(
  SKILLS_BY_CATEGORY,
).reduce<Record<string, SkillCategory>>((acc, [category, names]) => {
  for (const name of names) {
    acc[name.toLowerCase()] = category as SkillCategory;
  }
  return acc;
}, {});
