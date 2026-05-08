import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getDraftNotifications,
  markAllDraftNotificationsRead,
  markDraftNotificationRead,
  type DraftNotification,
} from "@/lib/draftPromotion";

export function useProfileNotifications() {
  const navigate = useNavigate();
  const [profileNotifications, setProfileNotifications] = useState<DraftNotification[]>([]);

  const refreshProfileNotifications = useCallback(() => {
    setProfileNotifications(getDraftNotifications());
  }, []);

  useEffect(() => {
    refreshProfileNotifications();
    window.addEventListener("mwz:notifications-changed", refreshProfileNotifications as EventListener);
    return () =>
      window.removeEventListener("mwz:notifications-changed", refreshProfileNotifications as EventListener);
  }, [refreshProfileNotifications]);

  const unreadProfileNotifications = useMemo(
    () => profileNotifications.filter((item) => !item.read).length,
    [profileNotifications]
  );

  const handleOpenNotification = useCallback(
    (notification: DraftNotification) => {
      markDraftNotificationRead(notification.id);
      refreshProfileNotifications();
      navigate(notification.target);
    },
    [navigate, refreshProfileNotifications]
  );

  const handleMarkAllNotificationsRead = useCallback(() => {
    markAllDraftNotificationsRead();
    refreshProfileNotifications();
  }, [refreshProfileNotifications]);

  return {
    profileNotifications,
    unreadProfileNotifications,
    handleOpenNotification,
    handleMarkAllNotificationsRead,
  };
}
