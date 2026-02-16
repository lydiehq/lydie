import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { Editor } from "@tiptap/core";

import { useEditorState } from "@tiptap/react";
import { useEffect, useState } from "react";

type Props = {
  editor: Editor;
  provider: HocuspocusProvider | null;
  isAdmin: boolean;
};

export function BottomBar({ editor, provider, isAdmin }: Props) {
  const editorState = useEditorState({
    editor,
    selector: (state) => {
      return {
        wordCount: state.editor.storage.characterCount.words(),
        characterCount: state.editor.storage.characterCount.characters(),
      };
    },
  });

  const [connectionStatus, setConnectionStatus] = useState<
    "connected" | "connecting" | "disconnected"
  >((provider as any)?.status || "disconnected");

  useEffect(() => {
    if (!provider) {
      setConnectionStatus("disconnected");
      return;
    }

    const handleStatusChange = ({ status }: { status: string }) => {
      setConnectionStatus(status as "connected" | "connecting" | "disconnected");
    };

    setConnectionStatus((provider as any).status);
    provider.on("status", handleStatusChange);

    return () => {
      provider.off("status", handleStatusChange);
    };
  }, [provider]);

  const getStatusColor = () => {
    switch (connectionStatus) {
      case "connected":
        return "bg-green-500";
      case "connecting":
        return "bg-yellow-500";
      case "disconnected":
        return "bg-red-500";
      default:
        return "bg-gray-400";
    }
  };

  return (
    <div className="absolute bottom-3 left-3 z-50">
      <div className="flex items-center gap-x-4">
        {/* <span className="text-xs text-gray-500">Characters: {editorState.characterCount}</span> */}
        <span className="text-xs text-gray-400">Words: {editorState.wordCount}</span>
        {isAdmin && (
          <div className="flex items-center gap-x-1.5" title={`Hocuspocus: ${connectionStatus}`}>
            <span className={`size-1.5 rounded-full ${getStatusColor()}`} />
            <span className="text-[10px] uppercase tracking-wider text-gray-400">
              {connectionStatus}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
