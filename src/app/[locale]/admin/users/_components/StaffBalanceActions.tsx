'use client'

import { useState } from 'react'
import { ArrowDownToLineIcon, ArrowUpFromLineIcon } from 'lucide-react'
import { toast } from 'sonner'
import { adjustUserBalance } from '@/app/[locale]/admin/users/_actions/adjust-user-balance'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

export default function StaffBalanceActions({ userId, username }: { userId: string, username: string }) {
  const [direction, setDirection] = useState<'deposit' | 'withdraw' | null>(null)
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (!direction) return
    setLoading(true)
    const result = await adjustUserBalance(userId, direction, Number(amount))
    setLoading(false)
    if (result.error) return toast.error(result.error)
    toast.success(direction === 'deposit' ? 'Deposit recorded' : 'Withdrawal recorded')
    setDirection(null)
    setAmount('')
  }

  return (
    <>
      <Button variant="outline" onClick={() => setDirection('deposit')}>
        <ArrowDownToLineIcon className="size-4" /> Deposit
      </Button>
      <Button variant="outline" onClick={() => setDirection('withdraw')}>
        <ArrowUpFromLineIcon className="size-4" /> Withdraw
      </Button>
      <Dialog open={direction !== null} onOpenChange={open => !open && setDirection(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{direction === 'deposit' ? 'Help with deposit' : 'Help with withdrawal'}</DialogTitle>
            <DialogDescription>Record a ledger adjustment for {username}.</DialogDescription>
          </DialogHeader>
          <Input type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} placeholder="Amount" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDirection(null)}>Cancel</Button>
            <Button disabled={loading || Number(amount) <= 0} onClick={() => void submit()}>{loading ? 'Saving...' : 'Confirm'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
