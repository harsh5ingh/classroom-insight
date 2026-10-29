export function Brand({
  inverse = false,
  compact = false,
}: {
  inverse?: boolean;
  compact?: boolean;
}) {
  return (
    <span className={`brand-wordmark ${inverse ? "inverse" : ""}`}>
      <svg
        width="32"
        height="36"
        viewBox="0 0 32 36"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M3 5h11v26H3zM18 5h11v26H18z"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <path
          d="M8 24v-8m11 8V12m5 12v-5"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path d="M3 31h26M16 1v34" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      {!compact && (
        <span>
          Classroom<span>Insight.</span>
        </span>
      )}
    </span>
  );
}
