import { Button } from "@lydie/ui/components/generic/Button";
import { useRef, useState } from "react";
import { Form } from "react-aria-components";
import { toast } from "sonner";

import { useAppForm } from "@/hooks/use-app-form";
import { useImageUpload } from "@/hooks/use-image-upload";
import { authClient } from "@/utils/auth";

import { ProfilePictureUpload } from "./ProfilePictureUpload";

type User = {
  name?: string | null;
  email: string;
  image?: string | null;
};

type ProfileFormProps = {
  user: User;
};

export function ProfileForm({ user }: ProfileFormProps) {
  const { uploadImage } = useImageUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(user?.image || null);

  const profileForm = useAppForm({
    defaultValues: {
      name: user?.name || "",
      email: user?.email || "",
    },
    onSubmit: async (values) => {
      if (!user) {
        toast.error("User not found");
        return;
      }

      if (!values.value.name.trim()) {
        toast.error("Name cannot be empty");
        return;
      }

      const hasChanges = values.value.name.trim() !== user.name;

      if (!hasChanges && previewImage === user.image) {
        return;
      }

      try {
        const updateData: {
          name: string;
          image?: string;
        } = {
          name: values.value.name.trim(),
        };

        if (previewImage !== null) {
          updateData.image = previewImage || undefined;
        }

        await authClient.updateUser(updateData);

        toast.success("Profile updated successfully");
        // The session will be automatically updated by better-auth
      } catch (error: any) {
        const errorMessage = error?.message || "Failed to update profile";
        toast.error(errorMessage);
        console.error("Profile update error:", error);
      }
    },
  });

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size must be less than 5MB");
      return;
    }

    setIsUploading(true);
    try {
      const imageUrl = await uploadImage(file);
      setPreviewImage(imageUrl);
      toast.success("Profile picture uploaded successfully");
    } catch (error) {
      toast.error("Failed to upload profile picture");
      console.error("Image upload error:", error);
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveImage = () => {
    setPreviewImage(null);
  };

  const userInitial = user?.name?.[0]?.toUpperCase() || user.email[0].toUpperCase();

  return (
    <Form
      className="flex flex-col gap-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        profileForm.handleSubmit();
      }}
    >
      <ProfilePictureUpload
        previewImage={previewImage}
        userInitial={userInitial}
        isUploading={isUploading}
        onImageSelect={handleImageSelect}
        onRemoveImage={handleRemoveImage}
      />

      <profileForm.AppField
        name="name"
        children={(field) => (
          <field.TextField label="Name" description="Your display name" isRequired />
        )}
      />

      <profileForm.AppField
        name="email"
        children={(field) => (
          <div className="flex flex-col gap-y-1">
            <field.TextField
              label="Email"
              description="Your email address"
              type="email"
              isReadOnly
              isDisabled
            />
            <p className="text-xs text-gray-500 mt-1">
              To change your email address, please contact us.
            </p>
          </div>
        )}
      />

      <div className="flex justify-end gap-x-1">
        <Button
          intent="secondary"
          size="sm"
          onPress={() => {
            profileForm.reset();
            setPreviewImage(user.image || null);
          }}
          type="button"
        >
          Cancel
        </Button>
        <Button size="sm" type="submit" isPending={profileForm.state.isSubmitting}>
          {profileForm.state.isSubmitting ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </Form>
  );
}
