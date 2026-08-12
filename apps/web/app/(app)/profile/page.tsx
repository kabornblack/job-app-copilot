"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProfileForm from "../../components/ProfileForm";
import AchievementsTab from "../../components/profile/AchievementsTab";
import CertificationsTab from "../../components/profile/CertificationsTab";
import EducationTab from "../../components/profile/EducationTab";
import PersonalInfoTab from "../../components/profile/PersonalInfoTab";
import SkillsTab from "../../components/profile/SkillsTab";
import WorkExperienceTab from "../../components/profile/WorkExperienceTab";

type ProfileTab =
  | "personal-info"
  | "work-experience"
  | "education"
  | "skills"
  | "certifications"
  | "achievements"
  | "job-search-preferences";

const TAB_ORDER: ProfileTab[] = [
  "personal-info",
  "work-experience",
  "education",
  "skills",
  "certifications",
  "achievements",
  "job-search-preferences",
];

const TAB_LABELS: Record<ProfileTab, string> = {
  "personal-info": "Personal Info",
  "work-experience": "Work Experience",
  education: "Education",
  skills: "Skills",
  certifications: "Certifications",
  achievements: "Achievements",
  "job-search-preferences": "Job Search Preferences",
};

export default function ProfilePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ProfileTab>("personal-info");

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <h1 className="text-xl font-semibold tracking-tight">Profile</h1>
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as ProfileTab)}
      >
        <div className="overflow-x-auto">
          <TabsList>
            {TAB_ORDER.map((tab) => (
              <TabsTrigger key={tab} value={tab}>
                {TAB_LABELS[tab]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="personal-info" className="mt-3">
          <PersonalInfoTab />
        </TabsContent>
        <TabsContent value="work-experience" className="mt-3">
          <WorkExperienceTab />
        </TabsContent>
        <TabsContent value="education" className="mt-3">
          <EducationTab />
        </TabsContent>
        <TabsContent value="skills" className="mt-3">
          <SkillsTab />
        </TabsContent>
        <TabsContent value="certifications" className="mt-3">
          <CertificationsTab />
        </TabsContent>
        <TabsContent value="achievements" className="mt-3">
          <AchievementsTab />
        </TabsContent>
        <TabsContent value="job-search-preferences" className="mt-3">
          <ProfileForm onSearchComplete={() => router.push("/dashboard")} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
