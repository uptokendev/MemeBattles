/**
 * Custom hook for managing token creation processing state.
 *
 * Internal navigation must be campaignAddress-only.
 * This hook therefore navigates to a caller-provided redirect path (e.g. /token/0x...).
 * If none is provided, it navigates to the Launchpad feed.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ProcessingStatus } from "@/types/token";
import { PROCESSING_TIMING } from "@/constants/processingStages";

export const useTokenProcessing = () => {
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>("queued");
  const [processingProgress, setProcessingProgress] = useState(0);

  // Caller can set the redirect at any time (e.g. after on-chain create resolves).
  const redirectToRef = useRef<string | null>(null);

  const setProcessingRedirectTo = useCallback((path: string | null) => {
    redirectToRef.current = path;
  }, []);

  useEffect(() => {
    if (!isProcessing) return;

    // Change status from queued to running
    const statusTimer = setTimeout(() => {
      setProcessingStatus("running");
    }, PROCESSING_TIMING.QUEUED_TO_RUNNING_DELAY);

    // Gradually increase progress
    const progressInterval = setInterval(() => {
      setProcessingProgress((prev) => {
        if (prev >= PROCESSING_TIMING.MAX_PROGRESS_THRESHOLD) return prev;
        return (
          prev +
          Math.random() * PROCESSING_TIMING.MAX_PROGRESS_INCREMENT +
          PROCESSING_TIMING.MIN_PROGRESS_INCREMENT
        );
      });
    }, PROCESSING_TIMING.PROGRESS_UPDATE_INTERVAL);

    // Complete the process
    const completeTimer = setTimeout(() => {
      setProcessingProgress(100);
      setProcessingStatus("succeeded");
      clearInterval(progressInterval);

      // Navigate after showing success
      setTimeout(() => {
        // IMPORTANT: do not navigate to the Showcase as a fallback if we simply haven't
        // resolved the campaign address yet (indexer / RPC delay). Wait briefly for the
        // caller to provide a redirect path.
        (async () => {
          const started = Date.now();
          const maxWaitMs = 20000;
          while (!redirectToRef.current && Date.now() - started < maxWaitMs) {
            await new Promise((r) => setTimeout(r, 500));
          }
          toast.success("Token created successfully!");
          navigate(redirectToRef.current ?? "/");
        })();
      }, PROCESSING_TIMING.SUCCESS_NAVIGATION_DELAY);
    }, PROCESSING_TIMING.TOTAL_PROCESS_DURATION);

    return () => {
      clearTimeout(statusTimer);
      clearTimeout(completeTimer);
      clearInterval(progressInterval);
    };
  }, [isProcessing, navigate]);

  const startProcessing = useCallback(() => {
    setProcessingRedirectTo(null);
    setIsProcessing(true);
    setProcessingStatus("queued");
    setProcessingProgress(0);
  }, [setProcessingRedirectTo]);

  return {
    isProcessing,
    processingStatus,
    processingProgress,
    startProcessing,
    setProcessingRedirectTo,
  };
};
