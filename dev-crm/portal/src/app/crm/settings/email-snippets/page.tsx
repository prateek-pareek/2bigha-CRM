import { redirect } from "next/navigation";

/** Old path — snippets are generic (notes, links, email). */
export default function LegacyEmailSnippetsRedirect() {
  redirect("/crm/settings/snippets");
}
