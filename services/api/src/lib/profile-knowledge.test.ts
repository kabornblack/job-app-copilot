import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../db/client";
import {
  achievements,
  certifications,
  education,
  personalDetails,
  skills,
  workExperience,
} from "../db/schema";
import {
  createAchievement,
  createCertification,
  createEducation,
  createSkill,
  createWorkExperience,
  deleteAchievement,
  deleteCertification,
  deleteEducation,
  deletePersonalDetails,
  deleteSkill,
  deleteWorkExperience,
  getPersonalDetails,
  listAchievements,
  listCertifications,
  listEducation,
  listSkills,
  listWorkExperience,
  updateAchievement,
  updateCertification,
  updateEducation,
  updateSkill,
  updateWorkExperience,
  upsertPersonalDetails,
} from "./profile-knowledge";

// Two fake user ids, same pattern as job-search.idempotency.test.ts (a
// hardcoded uuid used directly against the local Postgres schema — no real
// Supabase account needed since these functions are tested independently of
// the HTTP/auth layer).
const userA = "00000000-0000-4000-8000-0000000000a1";
const userB = "00000000-0000-4000-8000-0000000000b2";

afterAll(async () => {
  await db.delete(personalDetails).where(eq(personalDetails.userId, userA));
  await db.delete(personalDetails).where(eq(personalDetails.userId, userB));
  await db.delete(workExperience).where(eq(workExperience.userId, userA));
  await db.delete(workExperience).where(eq(workExperience.userId, userB));
  await db.delete(education).where(eq(education.userId, userA));
  await db.delete(education).where(eq(education.userId, userB));
  await db.delete(certifications).where(eq(certifications.userId, userA));
  await db.delete(certifications).where(eq(certifications.userId, userB));
  await db.delete(achievements).where(eq(achievements.userId, userA));
  await db.delete(achievements).where(eq(achievements.userId, userB));
  await db.delete(skills).where(eq(skills.userId, userA));
  await db.delete(skills).where(eq(skills.userId, userB));
});

describe("personal_details (1:1)", () => {
  it("upserts, reads, and stays scoped to the owning user", async () => {
    const created = await upsertPersonalDetails(userA, {
      fullName: "Alpha Alphason",
      email: "alpha@example.com",
    });
    expect(created.fullName).toBe("Alpha Alphason");

    const fetched = await getPersonalDetails(userA);
    expect(fetched?.email).toBe("alpha@example.com");

    // Second upsert updates the same row, does not create a second one.
    const updated = await upsertPersonalDetails(userA, {
      fullName: "Alpha Updated",
    });
    expect(updated.fullName).toBe("Alpha Updated");
    expect(updated.email).toBe("alpha@example.com"); // untouched field survives

    const rows = await db
      .select()
      .from(personalDetails)
      .where(eq(personalDetails.userId, userA));
    expect(rows).toHaveLength(1);

    // User B has never touched personal_details — isolation.
    const bFetched = await getPersonalDetails(userB);
    expect(bFetched).toBeNull();

    // Deleting as B is a no-op against A's row.
    const bDelete = await deletePersonalDetails(userB);
    expect(bDelete).toBeNull();
    const stillThere = await getPersonalDetails(userA);
    expect(stillThere?.fullName).toBe("Alpha Updated");

    // Deleting as A actually removes it.
    const aDelete = await deletePersonalDetails(userA);
    expect(aDelete?.userId).toBe(userA);
    expect(await getPersonalDetails(userA)).toBeNull();
  });
});

describe("work_experience (1:many)", () => {
  it("full CRUD + cross-user isolation", async () => {
    const created = await createWorkExperience(userA, {
      company: "Northwind Labs",
      title: "Senior Engineer",
      startMonth: 3,
      startYear: 2020,
      endMonth: 6,
      endYear: 2023,
      bullets: ["Shipped the thing", "Led the other thing"],
    });
    expect(created.company).toBe("Northwind Labs");
    expect(created.bullets).toEqual(["Shipped the thing", "Led the other thing"]);

    // Isolation: user B's list is empty even though A has a row.
    expect(await listWorkExperience(userB)).toHaveLength(0);
    expect(await listWorkExperience(userA)).toHaveLength(1);

    // User B cannot update A's row.
    const bUpdateAttempt = await updateWorkExperience(userB, created.id, {
      title: "Hijacked",
    });
    expect(bUpdateAttempt).toBeNull();

    // User A can update their own row.
    const updated = await updateWorkExperience(userA, created.id, {
      title: "Staff Engineer",
    });
    expect(updated?.title).toBe("Staff Engineer");
    expect(updated?.company).toBe("Northwind Labs"); // untouched field survives

    // User B cannot delete A's row.
    const bDeleteAttempt = await deleteWorkExperience(userB, created.id);
    expect(bDeleteAttempt).toBeNull();
    expect(await listWorkExperience(userA)).toHaveLength(1);

    // User A deletes their own row.
    const deleted = await deleteWorkExperience(userA, created.id);
    expect(deleted?.id).toBe(created.id);
    expect(await listWorkExperience(userA)).toHaveLength(0);
  });
});

describe("education (1:many)", () => {
  it("full CRUD + cross-user isolation", async () => {
    const created = await createEducation(userA, {
      institution: "University of Tartu",
      degree: "BSc Computer Science",
      startMonth: 9,
      startYear: 2014,
      endMonth: 6,
      endYear: 2018,
    });
    expect(created.institution).toBe("University of Tartu");

    expect(await listEducation(userB)).toHaveLength(0);

    const bUpdateAttempt = await updateEducation(userB, created.id, {
      degree: "Hijacked",
    });
    expect(bUpdateAttempt).toBeNull();

    const updated = await updateEducation(userA, created.id, {
      fieldOfStudy: "Computer Science",
    });
    expect(updated?.fieldOfStudy).toBe("Computer Science");
    expect(updated?.institution).toBe("University of Tartu");

    const bDeleteAttempt = await deleteEducation(userB, created.id);
    expect(bDeleteAttempt).toBeNull();

    const deleted = await deleteEducation(userA, created.id);
    expect(deleted?.id).toBe(created.id);
    expect(await listEducation(userA)).toHaveLength(0);
  });
});

describe("certifications (1:many)", () => {
  it("full CRUD + cross-user isolation", async () => {
    const created = await createCertification(userA, {
      name: "AWS Certified Solutions Architect",
      issuer: "Amazon Web Services",
      issueMonth: 4,
      issueYear: 2022,
    });
    expect(created.name).toBe("AWS Certified Solutions Architect");

    expect(await listCertifications(userB)).toHaveLength(0);

    const bUpdateAttempt = await updateCertification(userB, created.id, {
      name: "Hijacked",
    });
    expect(bUpdateAttempt).toBeNull();

    const updated = await updateCertification(userA, created.id, {
      credentialId: "ABC123",
    });
    expect(updated?.credentialId).toBe("ABC123");
    expect(updated?.name).toBe("AWS Certified Solutions Architect");

    const bDeleteAttempt = await deleteCertification(userB, created.id);
    expect(bDeleteAttempt).toBeNull();

    const deleted = await deleteCertification(userA, created.id);
    expect(deleted?.id).toBe(created.id);
    expect(await listCertifications(userA)).toHaveLength(0);
  });
});

describe("achievements (1:many)", () => {
  it("full CRUD + cross-user isolation", async () => {
    const created = await createAchievement(userA, {
      title: "Shipped Phase 7",
      month: 8,
      year: 2026,
    });
    expect(created.title).toBe("Shipped Phase 7");

    expect(await listAchievements(userB)).toHaveLength(0);

    const bUpdateAttempt = await updateAchievement(userB, created.id, {
      title: "Hijacked",
    });
    expect(bUpdateAttempt).toBeNull();

    const updated = await updateAchievement(userA, created.id, {
      description: "Profile knowledge base, backend stage",
    });
    expect(updated?.description).toBe("Profile knowledge base, backend stage");
    expect(updated?.title).toBe("Shipped Phase 7");

    const bDeleteAttempt = await deleteAchievement(userB, created.id);
    expect(bDeleteAttempt).toBeNull();

    const deleted = await deleteAchievement(userA, created.id);
    expect(deleted?.id).toBe(created.id);
    expect(await listAchievements(userA)).toHaveLength(0);
  });
});

describe("skills (1:many, separate from profiles.skills)", () => {
  it("full CRUD + cross-user isolation", async () => {
    const created = await createSkill(userA, {
      name: "TypeScript",
      category: "Languages",
    });
    expect(created.name).toBe("TypeScript");

    expect(await listSkills(userB)).toHaveLength(0);

    const bUpdateAttempt = await updateSkill(userB, created.id, {
      name: "Hijacked",
    });
    expect(bUpdateAttempt).toBeNull();

    const updated = await updateSkill(userA, created.id, {
      category: "Programming Languages",
    });
    expect(updated?.category).toBe("Programming Languages");
    expect(updated?.name).toBe("TypeScript");

    const bDeleteAttempt = await deleteSkill(userB, created.id);
    expect(bDeleteAttempt).toBeNull();

    const deleted = await deleteSkill(userA, created.id);
    expect(deleted?.id).toBe(created.id);
    expect(await listSkills(userA)).toHaveLength(0);
  });

  it("rejects a duplicate skill name for the same user with a clean error, not a raw DB error", async () => {
    await createSkill(userA, { name: "Python", category: "Languages" });

    await expect(
      createSkill(userA, { name: "Python", category: "Languages" }),
    ).rejects.toThrow('You already have a skill named "Python".');

    // Same skills_user_id_name_lower_unique index applies on rename via PATCH.
    const other = await createSkill(userA, { name: "Go" });
    await expect(
      updateSkill(userA, other.id, { name: "Python" }),
    ).rejects.toThrow('You already have a skill named "Python".');

    // A different user is unaffected by userA's constraint.
    const bCreated = await createSkill(userB, { name: "Python" });
    expect(bCreated.name).toBe("Python");
  });

  it("rejects case-variant duplicates too (skills_user_id_name_lower_unique)", async () => {
    const created = await createSkill(userA, { name: "React" });
    expect(created.name).toBe("React"); // stored casing is preserved as typed

    // A differently-cased duplicate on create must still collide.
    await expect(
      createSkill(userA, { name: "react" }),
    ).rejects.toThrow('You already have a skill named "react".');
    await expect(
      createSkill(userA, { name: "REACT" }),
    ).rejects.toThrow('You already have a skill named "REACT".');

    // And on rename via PATCH.
    const other = await createSkill(userA, { name: "Vue" });
    await expect(
      updateSkill(userA, other.id, { name: "react" }),
    ).rejects.toThrow('You already have a skill named "react".');

    // A different user is still unaffected.
    const bCreated = await createSkill(userB, { name: "react" });
    expect(bCreated.name).toBe("react");
  });
});
