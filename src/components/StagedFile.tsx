import AttachIcon from "@/components/AttachIcon";
import { t } from "@/lib/i18n";

// #2346 (7 Oct, Lika and Ninia, point 175). Choosing a file used to upload it
// at once, and the server acts on a file the moment it arrives: it writes the
// file's line and summary into the conversation, and a running answer takes
// it in. So a list was "sent and worked on" before Send was pressed and before
// the person had finished the sentence that went with it. Now a chosen file
// only waits here, by name, until Send, and the cross takes it back.
export default function StagedFile({
  name,
  onRemove,
  disabled = false,
}: {
  name: string;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-2 self-start"
      style={{
        maxWidth: "100%",
        padding: "4px 6px 4px 10px",
        borderRadius: "var(--radius-row)",
        background: "var(--thread-active-bg)",
        color: "var(--ink-soft)",
      }}
    >
      <AttachIcon />
      <span className="truncate" style={{ font: "500 13px/18px var(--font-system)", minWidth: 0 }}>
        {name}
      </span>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={t("attachRemove")}
        title={t("attachRemove")}
        className="flex shrink-0 items-center justify-center rounded-full disabled:opacity-40"
        style={{ width: 28, height: 28, color: "var(--meta)" }}
      >
        <svg viewBox="0 0 20 20" fill="none" style={{ width: 14, height: 14 }}>
          <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
