import { DismissRegular, ImageRegular } from "@fluentui/react-icons";
import { mutators } from "@lydie/zero/mutators";
import { useRef, useState } from "react";

import { Button } from "@/components/generic/Button";
import { useImageUpload } from "@/hooks/use-image-upload";
import { useZero } from "@/services/zero";

type Props = {
  documentId: string;
  organizationId: string;
  coverImage: string | null | undefined;
};

export function CoverImageEditor({ documentId, organizationId, coverImage }: Props) {
  const z = useZero();
  const { uploadImage } = useImageUpload();
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      window.alert("Please select an image file");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      window.alert("Image must be less than 10MB");
      return;
    }

    setIsUploading(true);
    try {
      const url = await uploadImage(file);
      z.mutate(
        mutators.document.update({
          documentId,
          coverImage: url,
          organizationId,
        }),
      );
    } catch (error) {
      console.error("Failed to upload cover image:", error);
      window.alert("Failed to upload image. Please try again.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemove = () => {
    z.mutate(
      mutators.document.update({
        documentId,
        coverImage: null,
        organizationId,
      }),
    );
  };

  const handleAddClick = () => {
    fileInputRef.current?.click();
  };

  if (coverImage) {
    return (
      <div className="relative group">
        <div
          className="w-full h-60 rounded-lg bg-center bg-cover bg-no-repeat"
          style={{ backgroundImage: `url(${coverImage})` }}
        />
        <Button
          onPress={handleRemove}
          intent="secondary"
          size="icon-sm"
          rounded={true}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Remove cover image"
        >
          <DismissRegular className="size-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="-ml-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        aria-label="Upload cover image"
      />
      <Button size="sm" intent="ghost" onPress={handleAddClick} isDisabled={isUploading}>
        <ImageRegular className="size-4 mr-1" />
        {isUploading ? "Uploading..." : "Add cover image"}
      </Button>
    </div>
  );
}
