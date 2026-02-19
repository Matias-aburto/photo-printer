import { PhotoGridEditor } from "@/components/photo-grid/PhotoGridEditor";

export default function Home() {
  return (
    <div className="h-screen w-full bg-background text-foreground overflow-hidden">
      <PhotoGridEditor />
    </div>
  );
}
