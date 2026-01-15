import { Button } from "./Button";
import { Trash2Icon } from "@/icons";
import { motion, AnimatePresence } from "motion/react";

interface BottomActionBarProps {
  open: boolean;
  selectedCount: number;
  onDelete: () => void;
}

export function BottomActionBar({
  open,
  selectedCount,
  onDelete,
}: BottomActionBarProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          exit={{ y: 100 }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-white border-t border-gray-200 shadow-lg"
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">
                {selectedCount} item{selectedCount !== 1 ? "s" : ""} selected
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button intent="danger" size="sm" onPress={onDelete}>
                <Trash2Icon className="size-4" />
                Delete
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
