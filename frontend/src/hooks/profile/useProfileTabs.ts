import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { isProfileTab, type ProfileTab } from "@/types/profile";

export type ProfileActivityTab = "trades" | "comments" | "created" | "interactions";

export function useProfileTabs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const addressParam = searchParams.get("address");
  const tabParam = searchParams.get("tab");

  const [activeTab, setActiveTab] = useState<ProfileTab>("balances");
  const [activityTab, setActivityTab] = useState<ProfileActivityTab>("trades");

  useEffect(() => {
    const t = String(tabParam ?? "").toLowerCase().trim();
    if (!t) return;

    const normalized = t === "activity" ? "replies" : t;
    if (isProfileTab(normalized)) setActiveTab(normalized);
  }, [tabParam]);

  const handleTabChange = useCallback(
    (tab: ProfileTab) => {
      setActiveTab(tab);

      const next = new URLSearchParams(searchParams);
      next.set("tab", tab);
      if (addressParam) next.set("address", addressParam);
      setSearchParams(next);
    },
    [addressParam, searchParams, setSearchParams]
  );

  return {
    searchParams,
    addressParam,
    tabParam,
    activeTab,
    setActiveTab,
    activityTab,
    setActivityTab,
    handleTabChange,
  };
}
