"use client";

import * as React from "react";
import { AuditLogList } from "@minarvabiz/ui";
import { phase7Store } from "@minarvabiz/business-logic";
import type { AuditLogEntry } from "@minarvabiz/types";

export default function AuditPage() {
  const [logs, setLogs] = React.useState<AuditLogEntry[]>([]);
  React.useEffect(() => setLogs(phase7Store.listAuditLogs(500)), []);
  return <AuditLogList logs={logs} />;
}
