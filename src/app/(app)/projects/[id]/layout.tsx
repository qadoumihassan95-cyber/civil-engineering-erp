import { ProjectHeader } from "./header";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div>
      <ProjectHeader projectId={id} />
      <div className="pt-4">{children}</div>
    </div>
  );
}
