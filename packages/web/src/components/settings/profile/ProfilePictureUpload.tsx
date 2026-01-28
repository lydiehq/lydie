import { CameraRegular, DismissRegular } from "@fluentui/react-icons";
import { useRef } from "react";

import { Button } from "@lydie/ui/components/generic/Button";
import { Card } from "@/components/layout/Card";

type ProfilePictureUploadProps = {
  previewImage: string | null;
  userInitial: string;
  isUploading: boolean;
  onImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: () => void;
};

export function ProfilePictureUpload({
  previewImage,
  userInitial,
  isUploading,
  onImageSelect,
  onRemoveImage,
}: ProfilePictureUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-y-4">
        <div className="flex flex-col gap-y-1">
          <label className="text-sm font-medium text-gray-900">Profile Picture</label>
          <p className="text-xs text-gray-500">
            Upload a profile picture. Recommended size: 200x200 pixels. Max file size: 5MB.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
              {previewImage ? (
                <img src={previewImage} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-300 text-gray-500 text-2xl font-medium">
                  {userInitial}
                </div>
              )}
            </div>
            {previewImage && (
              <button
                type="button"
                onClick={onRemoveImage}
                className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                aria-label="Remove profile picture"
              >
                <DismissRegular className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex flex-col gap-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onImageSelect}
              className="hidden"
            />
            <Button
              type="button"
              intent="secondary"
              size="sm"
              onPress={handleImageClick}
              isDisabled={isUploading}
            >
              <CameraRegular className="size-3.5 mr-1" />
              {isUploading ? "Uploading..." : "Upload Picture"}
            </Button>
            {previewImage && (
              <Button type="button" intent="secondary" size="sm" onPress={onRemoveImage}>
                Remove Picture
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
