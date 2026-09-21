'use client'

import { UserPlus } from 'lucide-react'
import { useActionState, useState } from 'react'
import { FormMessage } from '@/components/forms/form-message'
import { SubmitButton } from '@/components/forms/submit-button'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableWrapper,
} from '@/components/ui/table'
import type { Tables } from '@/lib/database.types'
import { formatDateTime } from '@/lib/date'
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type Role } from '@/lib/roles'
import { IDLE } from '@/lib/action-state'
import { inviteMemberAction, updateMemberAction } from '@/server/actions/settings'

export function UtentiPanel({
  members,
  currentMembershipId,
}: {
  members: readonly Tables<'memberships'>[]
  currentMembershipId: string
}) {
  return (
    <Card>
      <CardHeader>
        <div className="space-y-1">
          <CardTitle>Utenti dell’agenzia</CardTitle>
          <p className="text-small text-text-muted">
            Il ruolo decide che cosa ciascuno può vedere e modificare.
          </p>
        </div>
        <InviteDialog />
      </CardHeader>
      <CardContent className="p-0">
        <TableWrapper className="rounded-none border-0 shadow-none">
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Persona</TableHeaderCell>
                <TableHeaderCell>Ruolo</TableHeaderCell>
                <TableHeaderCell>Attivo</TableHeaderCell>
                <TableHeaderCell>Ultimo accesso</TableHeaderCell>
                <TableHeaderCell className="text-right">Azioni</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {members.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  isCurrentUser={member.id === currentMembershipId}
                />
              ))}
            </TableBody>
          </Table>
        </TableWrapper>
      </CardContent>
    </Card>
  )
}

function MemberRow({
  member,
  isCurrentUser,
}: {
  member: Tables<'memberships'>
  isCurrentUser: boolean
}) {
  const [state, submit] = useActionState(updateMemberAction, IDLE)
  const [role, setRole] = useState<Role>(member.role)
  const [active, setActive] = useState(member.is_active)

  const changed = role !== member.role || active !== member.is_active

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2.5">
          <Avatar name={member.full_name} />
          <div className="min-w-0">
            <p className="truncate text-small font-medium text-text">
              {member.full_name}
              {isCurrentUser ? (
                <Badge tone="accent" className="ml-2">
                  Tu
                </Badge>
              ) : null}
            </p>
            <p className="truncate text-caption text-text-muted">{member.email}</p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <form action={submit} id={`membro-${member.id}`} className="contents">
          <input type="hidden" name="membership_id" value={member.id} />
          <input type="hidden" name="role" value={role} />
          {active ? <input type="hidden" name="is_active" value="on" /> : null}
          <Select value={role} onValueChange={(value) => setRole(value as Role)}>
            <SelectTrigger className="w-44" aria-label={`Ruolo di ${member.full_name}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((option) => (
                <SelectItem key={option} value={option}>
                  {ROLE_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 max-w-56 text-caption text-text-subtle">{ROLE_DESCRIPTIONS[role]}</p>
        </form>
      </TableCell>
      <TableCell>
        <Switch
          checked={active}
          onCheckedChange={setActive}
          aria-label={`Accesso attivo per ${member.full_name}`}
        />
      </TableCell>
      <TableCell className="text-small text-text-muted">
        {member.last_seen_at ? formatDateTime(member.last_seen_at) : 'Mai'}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-col items-end gap-1">
          <Button
            type="submit"
            form={`membro-${member.id}`}
            variant={changed ? 'primary' : 'secondary'}
            size="sm"
            disabled={!changed}
          >
            Salva
          </Button>
          {state.status !== 'idle' && state.message ? (
            <span
              className={
                state.status === 'error' ? 'text-caption text-danger' : 'text-caption text-success'
              }
              role={state.status === 'error' ? 'alert' : 'status'}
            >
              {state.message}
            </span>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  )
}

function InviteDialog() {
  const [state, submit] = useActionState(inviteMemberAction, IDLE)
  const [role, setRole] = useState<Role>('operatore')

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="primary" size="sm">
          <UserPlus aria-hidden="true" />
          Invita collaboratore
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <form action={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Invita un collaboratore</DialogTitle>
            <DialogDescription>
              Riceve una email per impostare la password e trova subito il ruolo assegnato.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <Field label="Nome e cognome" required error={state.fieldErrors?.full_name}>
              {(props) => <Input {...props} name="full_name" autoComplete="name" required />}
            </Field>
            <Field label="Email" required error={state.fieldErrors?.email}>
              {(props) => <Input {...props} name="email" type="email" required />}
            </Field>
            <Field label="Mansione" error={state.fieldErrors?.job_title}>
              {(props) => <Input {...props} name="job_title" placeholder="Consulente di viaggio" />}
            </Field>
            <Field label="Ruolo" required hint={ROLE_DESCRIPTIONS[role]}>
              {(props) => (
                <>
                  <input type="hidden" name="role" value={role} />
                  <Select value={role} onValueChange={(value) => setRole(value as Role)}>
                    <SelectTrigger id={props.id}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {ROLE_LABELS[option]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </Field>
            <FormMessage status={state.status} message={state.message} />
          </DialogBody>
          <DialogFooter>
            <SubmitButton pendingLabel="Invio...">Invia l’invito</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
