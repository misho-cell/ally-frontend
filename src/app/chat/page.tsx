export default function ChatIndexPage() {
  return (
    <div
      className="hidden md:flex flex-1 h-full items-center justify-center"
      style={{ background: "var(--bg)" }}
    >
      <p style={{ color: "var(--placeholder)", fontSize: "15px" }}>
        Select a thread or start a new chat
      </p>
    </div>
  );
}
