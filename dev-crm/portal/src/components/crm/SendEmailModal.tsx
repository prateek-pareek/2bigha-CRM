"use client";

import React, { useEffect } from "react";
import { useEmailComposerStore, EmailComposerProps } from "@/stores/emailComposerStore";

interface SendEmailModalProps extends EmailComposerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SendEmailModal({ isOpen, onClose, ...props }: SendEmailModalProps) {
  const openComposer = useEmailComposerStore(s => s.openComposer);
  const bulkRecipientKey = props.bulkRecipients
    ?.map((r) => `${r.entityId ?? ""}:${r.email}`)
    .join("|");

  // To avoid unmounting the actual composer when this local placeholder unmounts,
  // we do NOT register a cleanup to automatically close it.
  useEffect(() => {
    if (isOpen) {
      openComposer({ ...props, onClose });
    }
  }, [
    isOpen,
    props.recipientEmail,
    props.recipientName,
    props.module,
    props.entityId,
    props.crmInboxMode,
    bulkRecipientKey,
    onClose,
    openComposer,
  ]);

  // Render absolutely nothing locally - the GlobalEmailComposer (in AppShell or CRM Layout) 
  // will render the actual floating window.
  return null;
}
