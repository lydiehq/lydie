import { useState, useEffect } from "react";
import { getUserStorage, setUserStorage } from "@/lib/user-storage";
import { useAuth } from "@/context/auth.context";

export type OnboardingChecklistItem = 
  | "documents:organize-folders"
  | "documents:search-menu"
  | "documents:rich-editing"
  | "documents:open-command-menu"
  | "documents:create-document"
  | "documents:explore-editor";

const ONBOARDING_CHECKLIST_KEY = "onboarding_checklist";

export function useOnboardingChecklist() {
  const { session } = useAuth();
  const userId = session?.userId;

  const [checkedItems, setCheckedItemsState] = useState<Set<OnboardingChecklistItem>>(
    new Set()
  );

  // Load initial state from localStorage
  useEffect(() => {
    const stored = getUserStorage(userId, ONBOARDING_CHECKLIST_KEY);
    if (stored && Array.isArray(stored)) {
      setCheckedItemsState(new Set(stored as OnboardingChecklistItem[]));
    }
  }, [userId]);

  const setChecked = (item: OnboardingChecklistItem, checked: boolean) => {
    setCheckedItemsState((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(item);
      } else {
        next.delete(item);
      }
      // Persist to localStorage
      setUserStorage(userId, ONBOARDING_CHECKLIST_KEY, Array.from(next));
      return next;
    });
  };

  const isChecked = (item: OnboardingChecklistItem) => {
    return checkedItems.has(item);
  };

  return {
    isChecked,
    setChecked,
    checkedItems,
  };
}
