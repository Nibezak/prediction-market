'use client'

import type { Comment, User } from '@/types'
import { HeartIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAppKit } from '@/hooks/useAppKit'
import { cn } from '@/lib/utils'

interface EventCommentLikeFormProps {
  comment: Comment
  user: User | null
  onLikeToggled: () => void
  isSubmitting?: boolean
}

export default function EventCommentLikeForm({
  comment,
  user,
  onLikeToggled,
  isSubmitting = false,
}: EventCommentLikeFormProps) {
  const { open } = useAppKit()
  const initialLikesCount = comment.likes_count ?? 0
  const initialHasLiked = Boolean(comment.user_has_liked)

  const [hasLiked, setHasLiked] = useState(initialHasLiked)
  const [likesCount, setLikesCount] = useState(initialLikesCount)

  useEffect(() => {
    setHasLiked(initialHasLiked)
    setLikesCount(initialLikesCount)
  }, [initialHasLiked, initialLikesCount])

  function handleClick() {
    if (isSubmitting) {
      return
    }
    if (!user) {
      void open()
      return
    }

    const nextLiked = !hasLiked
    setHasLiked(nextLiked)
    setLikesCount(prev => (nextLiked ? prev + 1 : Math.max(0, prev - 1)))
    onLikeToggled()
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      onClick={handleClick}
      disabled={isSubmitting}
      aria-pressed={hasLiked}
      title={hasLiked ? 'Remove like' : 'Like'}
      className={cn(`
        flex size-auto items-center gap-1 rounded-sm px-1.5 py-0.5 text-sm text-muted-foreground
        hover:bg-accent hover:text-foreground
      `)}
    >
      <HeartIcon className={cn({
        'fill-current text-destructive': hasLiked,
      }, 'size-4')}
      />
      <span>{likesCount}</span>
    </Button>
  )
}
