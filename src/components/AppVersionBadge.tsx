 "use client";

type Props = {
  version: string;
};

export function AppVersionBadge({ version }: Props) {
  if (!version) return null;

  return (
    <div className="fixed bottom-2 right-3 z-40 rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[11px] text-muted-foreground/80 shadow-sm backdrop-blur">
      v{version}
    </div>
  );
}

