'use client'

import { useState } from 'react'
import { PlusIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { createCategoryAction } from '@/app/[locale]/admin/categories/_actions/create-category'

export function CreateCategoryDialog({ onSuccess }: { onSuccess?: () => void }) {
  const t = useExtracted()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [isMainCategory, setIsMainCategory] = useState(true)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setIsLoading(true)
    try {
      const result = await createCategoryAction({ name: name.trim(), is_main_category: isMainCategory })
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t('Category created successfully'))
        setOpen(false)
        setName('')
        setIsMainCategory(true)
        onSuccess?.()
      }
    } catch (err) {
      toast.error(t('An unexpected error occurred'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" className="h-8">
          <PlusIcon className="mr-2 size-4" />
          {t('Create Category')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('Create Category')}</DialogTitle>
            <DialogDescription>
              {t('Add a new category to the platform. It will be synced locally.')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('Name')}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('e.g. Technology')}
                disabled={isLoading}
                required
              />
            </div>
            
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label>{t('Main Category')}</Label>
                <div className="text-muted-foreground text-xs">
                  {t('Show this category in the main navigation sidebar.')}
                </div>
              </div>
              <Switch
                checked={isMainCategory}
                onCheckedChange={setIsMainCategory}
                disabled={isLoading}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
              {t('Cancel')}
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim()}>
              {isLoading ? t('Creating...') : t('Create Category')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
