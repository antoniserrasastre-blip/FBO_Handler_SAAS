import { ReactNode } from "react";

export interface HelixFooterProps {
  syncLabel?: ReactNode;
  shortcuts?: ReactNode;
  version?: ReactNode;
}

export function HelixFooter({
  syncLabel = "sync live",
  shortcuts,
  version = "Helix v1.0",
}: HelixFooterProps) {
  return (
    <footer className="hx-footer">
      <div className="left">
        <span className="sync">
          <span className="d" />
          {syncLabel}
        </span>
        {shortcuts ? <span>{shortcuts}</span> : null}
      </div>
      <span>{version}</span>
    </footer>
  );
}
