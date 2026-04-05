export default function TrashIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4.5 2V1.5C4.5 0.672 5.172 0 6 0h4c.828 0 1.5.672 1.5 1.5V2h3a.5.5 0 010 1h-.554l-.675 10.81A1.5 1.5 0 0111.78 15H4.22a1.5 1.5 0 01-1.491-1.19L2.054 3H1.5a.5.5 0 010-1h3zm1 0h5v-.5a.5.5 0 00-.5-.5H6a.5.5 0 00-.5.5V2zM3.06 3l.662 10.607a.5.5 0 00.497.393h7.562a.5.5 0 00.497-.393L12.94 3H3.06z"
        fill="currentColor"
      />
    </svg>
  );
}
