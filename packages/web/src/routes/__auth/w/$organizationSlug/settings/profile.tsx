import { createFileRoute } from "@tanstack/react-router";
import { Separator } from "@/components/generic/Separator";
import { Heading } from "@/components/generic/Heading";
import { toast } from "sonner";
import { Form } from "react-aria-components";
import { Button } from "@/components/generic/Button";
import { useAppForm } from "@/hooks/use-app-form";
import { useAuth } from "@/context/auth.context";
import { authClient } from "@/utils/auth";
import { useImageUpload } from "@/hooks/use-image-upload";
import { useState, useRef } from "react";
import { Camera, X } from "lucide-react";
import { Card } from "@/components/layout/Card";

export const Route = createFileRoute(
  "/__auth/w/$organizationSlug/settings/profile"
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { user, session } = useAuth();
  const { uploadImage } = useImageUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(
    user?.image || null
  );

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

      const hasChanges =
        values.value.name.trim() !== user.name;

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
        const errorMessage =
          error?.message || "Failed to update profile";
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

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  if (!user) {
    return (
      <div className="flex flex-col gap-y-6">
        <div>
          <Heading level={1}>Profile</Heading>
        </div>
        <Separator />
        <div className="text-sm text-gray-500">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-y-6">
      <div>
        <Heading level={1}>Profile</Heading>
      </div>
      <Separator />

      <div className="flex flex-col gap-y-4">
        <div className="flex flex-col gap-y-0.5">
          <Heading level={2}>Profile Information</Heading>
          <p className="text-sm/relaxed text-gray-600">
            Update your profile information and profile picture.
          </p>
        </div>

        <Form
          className="flex flex-col gap-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            profileForm.handleSubmit();
          }}
        >
          {/* Profile Picture Section */}
          <Card className="p-4">
            <div className="flex flex-col gap-y-4">
              <div className="flex flex-col gap-y-1">
                <label className="text-sm font-medium text-gray-900">
                  Profile Picture
                </label>
                <p className="text-xs text-gray-500">
                  Upload a profile picture. Recommended size: 200x200 pixels.
                  Max file size: 5MB.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
                    {previewImage ? (
                      <img
                        src={previewImage}
                        alt="Profile"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-300 text-gray-500 text-2xl font-medium">
                        {user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                  {previewImage && (
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                      aria-label="Remove profile picture"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    intent="secondary"
                    size="sm"
                    onPress={handleImageClick}
                    isDisabled={isUploading}
                  >
                    <Camera className="size-3.5 mr-1" />
                    {isUploading ? "Uploading..." : "Upload Picture"}
                  </Button>
                  {previewImage && (
                    <Button
                      type="button"
                      intent="secondary"
                      size="sm"
                      onPress={handleRemoveImage}
                    >
                      Remove Picture
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Name Field */}
          <profileForm.AppField
            name="name"
            children={(field) => (
              <field.TextField
                label="Name"
                description="Your display name"
                isRequired
              />
            )}
          />

          {/* Email Field */}
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
            <Button
              size="sm"
              type="submit"
              isPending={profileForm.state.isSubmitting}
            >
              {profileForm.state.isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </Form>
      </div>
    </div>
  );
}

