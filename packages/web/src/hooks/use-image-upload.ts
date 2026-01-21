import { useAuthenticatedApi } from "@/services/api"
import { uploadImage } from "@/utils/image-upload"
import { useCallback } from "react"

export function useImageUpload() {
  const { createClient } = useAuthenticatedApi()

  const handleImageUpload = useCallback(
    async (file: File): Promise<string> => {
      const client = await createClient()
      return uploadImage(file, client)
    },
    [createClient],
  )

  return { uploadImage: handleImageUpload }
}
