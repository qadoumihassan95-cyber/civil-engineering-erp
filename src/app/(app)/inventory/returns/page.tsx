import { InventoryDocPage } from "@/components/inventory/doc-page";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const sp = await searchParams;
  return <InventoryDocPage kind="return" openId={sp.open ?? null} />;
}
