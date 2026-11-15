import { Suspense } from "react";
import { LoadingLine } from "@/ui/primitives";
import { TaskScreen } from "@/ui/tasks/task-screen";

export default function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<LoadingLine />}>
      <Loaded params={params} />
    </Suspense>
  );
}

async function Loaded({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TaskScreen id={id} />;
}
