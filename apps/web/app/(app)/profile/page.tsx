"use client";

import { useRouter } from "next/navigation";
import ProfileForm from "../../components/ProfileForm";

export default function ProfilePage() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-2xl">
      <ProfileForm
        onSearchComplete={() => {
          router.push("/dashboard");
        }}
      />
    </div>
  );
}
