type SettingsIconProps = {
  className?: string;
};

export function SettingsIcon({ className }: SettingsIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="18"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M9.67 2h4.66l.7 2.73c.44.17.86.42 1.24.72l2.72-.77 2.33 4.04-2.02 1.96c.04.43.04.87 0 1.31l2.02 1.96-2.33 4.04-2.72-.77c-.38.3-.8.55-1.24.72l-.7 2.73H9.67l-.7-2.73a7.02 7.02 0 0 1-1.24-.72l-2.72.77-2.33-4.04 2.02-1.96a7.94 7.94 0 0 1 0-1.31L2.68 8.72l2.33-4.04 2.72.77c.38-.3.8-.55 1.24-.72L9.67 2Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
