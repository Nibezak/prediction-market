'use server'

import { Buffer } from 'node:buffer'
import { revalidatePath } from 'next/cache'
import sharp from 'sharp'
import { z } from 'zod'
import { DEFAULT_ERROR_MESSAGE } from '@/lib/constants'
import { UserRepository } from '@/lib/db/queries/user'
import { validateOutboundImageUrl } from '@/lib/og-image-security'
import { getPublicAssetUrl, uploadPublicAsset } from '@/lib/storage'

const MAX_FILE_SIZE = 2 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

export interface ActionState {
  error?: string
  errors?: Record<string, string | undefined>
  image?: string
}

function emptyStringToUndefined(value: unknown) {
  if (value === null || value === undefined) {
    return undefined
  }

  if (typeof value === 'string' && value.trim().length === 0) {
    return undefined
  }

  return value
}

const UpdateUserSchema = z.object({
  email: z.preprocess(
    emptyStringToUndefined,
    z.email({ pattern: z.regexes.html5Email, error: 'Invalid email address.' }).optional(),
  ),
  username: z
    .string()
    .min(3, 'Username must be at least 3 character long')
    .max(42, 'Username must be at most 42 characters long')
    .regex(/^[A-Z0-9.-]+$/i, 'Only letters, numbers, dots and hyphens are allowed')
    .regex(/^(?![.-])/, 'Cannot start with a dot or hyphen')
    .regex(/(?<![.-])$/, 'Cannot end with a dot or hyphen'),
  image: z
    .instanceof(File)
    .optional()
    .refine((file) => {
      if (!file || file.size === 0) {
        return true
      }

      return file.size <= MAX_FILE_SIZE
    }, { error: 'Image must be less than 2MB' })
    .refine((file) => {
      if (!file || file.size === 0) {
        return true
      }

      return ACCEPTED_IMAGE_TYPES.includes(file.type)
    }, { error: 'Only JPG, PNG, and WebP images are allowed' }),
  avatar_url: z.preprocess(
    emptyStringToUndefined,
    z.string().url('Avatar URL must be a valid URL').refine((value) => {
      const protocol = new URL(value).protocol
      return protocol === 'http:' || protocol === 'https:'
    }, { error: 'Avatar URL must start with http:// or https://' }).optional(),
  ),
})

export async function updateUserAction(formData: FormData): Promise<ActionState> {
  try {
    const user = await UserRepository.getCurrentUser({ minimal: true })
    if (!user) {
      return { error: 'Unauthenticated.' }
    }

    const imageFile = formData.get('image') as File
    const emailRaw = formData.get('email')
    const avatarUrlRaw = formData.get('avatar_url')
    const avatarUrl = typeof avatarUrlRaw === 'string' && avatarUrlRaw.trim().length > 0
      ? avatarUrlRaw.trim()
      : undefined

    console.log('[Profile Update] User:', user.id, 'Has image file:', Boolean(imageFile && imageFile.size > 0))

    const rawData = {
      email: typeof emailRaw === 'string' ? emailRaw : undefined,
      username: formData.get('username') as string,
      image: imageFile && imageFile.size > 0 ? imageFile : undefined,
      avatar_url: avatarUrl,
    }

    const validated = UpdateUserSchema.safeParse(rawData)
    if (!validated.success) {
      console.log('[Profile Update] Validation failed:', validated.error.issues)
      const errors: ActionState['errors'] = {}
      validated.error.issues.forEach((issue) => {
        if (issue.path[0]) {
          errors[issue.path[0] as keyof typeof errors] = issue.message
        }
      })

      return { errors }
    }

    if (validated.data.avatar_url && !(await validateOutboundImageUrl(validated.data.avatar_url))) {
      return {
        errors: {
          avatar_url: 'Avatar URL must point to a public HTTP(S) image host.',
        },
      }
    }

    const updateData: Record<string, unknown> = {
      username: validated.data.username,
    }

    if (validated.data.email) {
      updateData.email = validated.data.email
    }

    if (validated.data.avatar_url) {
      updateData.image = validated.data.avatar_url
    }
    else if (validated.data.image && validated.data.image.size > 0) {
      console.log('[Profile Update] Processing image upload')
      updateData.image = await uploadImage(user, validated.data.image)
    }

    console.log('[Profile Update] Updating user profile:', updateData)
    const { error } = await UserRepository.updateUserProfileById(user.id, updateData)
    if (error) {
      console.error('[Profile Update] Database update failed:', error)
      return { error }
    }

    revalidatePath('/settings')
    const finalImage = typeof updateData.image === 'string' ? getPublicAssetUrl(updateData.image) : user.image
    console.log('[Profile Update] Profile updated successfully, image:', finalImage)
    return { image: finalImage }
  }
  catch (error) {
    console.error('[Profile Update] Unexpected error:', error)
    return { error: DEFAULT_ERROR_MESSAGE }
  }
}

async function uploadImage(user: any, image: File) {
  const fileName = `users/avatars/${user.id}-${Date.now()}.jpg`

  const buffer = Buffer.from(await image.arrayBuffer())

  const resizedBuffer = await sharp(buffer)
    .resize(100, 100, { fit: 'cover' })
    .jpeg({ quality: 90 })
    .toBuffer()

  console.log('[Profile Upload] Attempting to upload image:', fileName, 'Size:', resizedBuffer.length)
  
  try {
    const { error } = await uploadPublicAsset(fileName, resizedBuffer, {
      contentType: 'image/jpeg',
      cacheControl: '31536000',
      upsert: true,
    })

    if (error) {
      console.error('[Profile Upload] Upload failed:', error)
      throw new Error(`Profile image upload failed: ${error}`)
    }

    console.log('[Profile Upload] Upload successful:', fileName)
    return fileName
  } catch (uploadError) {
    console.error('[Profile Upload] Upload error:', uploadError)
    throw new Error(`Profile image upload failed: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`)
  }
}
