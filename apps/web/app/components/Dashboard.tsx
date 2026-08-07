"use client";
import { useMemo, useState } from "react";
import ProfileForm from "./ProfileForm";
import ReviewQueue from "./ReviewQueue";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function Dashboard() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSearchComplete = () => {
    setRefreshKey((current) => current + 1);
  };

  const memoizedApiUrl = useMemo(() => apiUrl, []);

  return (
    <>
      <ProfileForm
        apiUrl={memoizedApiUrl}
        onSearchComplete={handleSearchComplete}
      />
      <ReviewQueue apiUrl={memoizedApiUrl} refreshKey={refreshKey} />
    </>
  );
}
