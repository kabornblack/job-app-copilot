import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { profiles } from "../db/schema";
import { profileDataEquals, type ProfileFields } from "./profile";

export type ResolvedProfile = typeof profiles.$inferSelect;

export type ResolveProfileResult = {
  profile: ResolvedProfile;
  profileReused: boolean;
};

/**
 * The current active (isActive=true) profiles row for a user, or null if
 * they've never searched yet. Factored out of resolveActiveProfile so
 * GET /profile (index.ts) can read the same "what's active right now"
 * logic without duplicating the query.
 */
export async function getActiveProfile(
  userId: string,
): Promise<ResolvedProfile | null> {
  const [activeProfile] = await db
    .select()
    .from(profiles)
    .where(and(eq(profiles.userId, userId), eq(profiles.isActive, true)))
    .orderBy(desc(profiles.createdAt))
    .limit(1);
  return activeProfile ?? null;
}

export async function resolveActiveProfile(
  incomingProfile: ProfileFields,
  userId: string,
): Promise<ResolveProfileResult> {
  const activeProfile = await getActiveProfile(userId);

  if (activeProfile && profileDataEquals(activeProfile, incomingProfile)) {
    return { profile: activeProfile, profileReused: true };
  }

  if (activeProfile) {
    await db
      .update(profiles)
      .set({ isActive: false })
      .where(and(eq(profiles.userId, userId), eq(profiles.isActive, true)));
  }

  const [insertedProfile] = await db
    .insert(profiles)
    .values({
      userId,
      version: activeProfile ? activeProfile.version + 1 : 1,
      skills: incomingProfile.skills,
      targetRoles: incomingProfile.targetRoles ?? [],
      locations: incomingProfile.locations ?? [],
      salaryMin: incomingProfile.salaryMin ?? undefined,
      salaryMax: incomingProfile.salaryMax ?? undefined,
      currency: incomingProfile.currency ?? "EUR",
      remotePref: incomingProfile.remotePref ?? "any",
      resumeSummary: incomingProfile.resumeSummary ?? undefined,
      isActive: true,
    })
    .returning();

  if (!insertedProfile) {
    throw new Error("Failed to create profile");
  }

  return { profile: insertedProfile, profileReused: false };
}
