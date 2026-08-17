import { InventoryDocPage } from "@/components/inventory/doc-page";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const sp = await searchParams;
  return <InventoryDocPage kind="transfer" openId={sp.open ?? null} />;
}
