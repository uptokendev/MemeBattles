import { useEffect, useState } from "react";
import {
  claimMockWeeklyReward,
  getResolvedCommanderStreak,
  recordMockCommanderCheckIn,
  resetMockCommanderStreakRuntime,
  subscribeToMockCommanderStreakRuntime,
} from "@/features/postgrad/mockStreakRuntime";

export function useMockCommanderStreak() {
  const [streak, setStreak] = useState(() => getResolvedCommanderStreak());

  useEffect(() => {
    return subscribeToMockCommanderStreakRuntime(() => {
      setStreak(getResolvedCommanderStreak());
    });
  }, []);

  return {
    streak,
    recordMockCommanderCheckIn,
    claimMockWeeklyReward,
    resetMockCommanderStreakRuntime,
  };
}
