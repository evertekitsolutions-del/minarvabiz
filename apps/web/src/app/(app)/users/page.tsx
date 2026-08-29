"use client";

import * as React from "react";
import { Button, Card, CardContent, FormField, inputClass, selectClass } from "@minarvabiz/ui";
import {
  listAppUsers,
  createAppUser,
  setUserActive,
  setUserRole,
} from "@minarvabiz/business-logic";
import type { RoleName } from "@minarvabiz/types";

const ROLES: RoleName[] = ["super_admin", "admin", "manager", "cashier", "tailor", "staff"];

export default function UsersPage() {
  const [users, setUsers] = React.useState(() => listAppUsers());
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState<RoleName>("cashier");

  const refresh = () => setUsers(listAppUsers());

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Users & roles</h2>
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-4">
          <FormField label="Full name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="Email">
            <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>
          <FormField label="Role">
            <select className={selectClass} value={role} onChange={(e) => setRole(e.target.value as RoleName)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </FormField>
          <div className="flex items-end">
            <Button
              onClick={() => {
                if (!email || !name) return;
                createAppUser({ email, fullName: name, role });
                setEmail("");
                setName("");
                refresh();
              }}
            >
              Add user
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="space-y-2">
        {users.map((u) => (
          <Card key={u.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div>
                <div className="font-medium">{u.fullName}</div>
                <div className="text-slate-500">{u.email}</div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className={selectClass}
                  value={u.role}
                  onChange={(e) => {
                    setUserRole(u.id, e.target.value as RoleName);
                    refresh();
                  }}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setUserActive(u.id, !u.isActive);
                    refresh();
                  }}
                >
                  {u.isActive ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
