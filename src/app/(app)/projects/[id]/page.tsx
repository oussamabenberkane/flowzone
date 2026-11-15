import { Suspense } from "react";
import { LoadingLine } from "@/ui/primitives";
import { ProjectScreen } from "@/ui/projects/projects-screens";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<LoadingLine />}>
      <Loaded params={params} />
    </Suspense>
  );
}

async function Loaded({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectScreen id={id} />;
}
