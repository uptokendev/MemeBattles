import { useEffect, useState } from "react";
import {
  getMockActivityLog,
  resetMockActivityRuntime,
  subscribeToMockActivityRuntime,
} from "@/features/postgrad/mockActivityRuntime";

export function useMockActivityLog() {
  const [activityLog, setActivityLog] = useState(() => getMockActivityLog());

  useEffect(() => {
    return subscribeToMockActivityRuntime(() => {
      setActivityLog(getMockActivityLog());
    });
  }, []);

  return {
    activityLog,
    resetMockActivityRuntime,
  };
}
