import type { SVGProps } from "react";

export function NekoIcon({ className = "w-5 h-5", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {/* Neko Head Outline Silhouette */}
      <path
        d="M16 10 C 13.5 10 11.8 11 10.8 11.8 L 6.2 5.5 C 5.5 4.6 4.2 5.2 4.5 6.4 L 6.2 14.5 C 4.8 17.2 4.8 20.8 7.5 23.8 C 10 26.5 13 26.8 16 26.8 C 19 26.8 22 26.5 24.5 23.8 C 27.2 20.8 27.2 17.2 25.8 14.5 L 27.5 6.4 C 27.8 5.2 26.5 4.6 25.8 5.5 L 21.2 11.8 C 20.2 11 18.5 10 16 10 Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Alert Inner Ears */}
      <path
        d="M7.8 11.8 L 7 8 L 10.8 11.2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M24.2 11.8 L 25 8 L 21.2 11.2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Expressive Eyes */}
      <circle cx="11.5" cy="17" r="1.5" fill="currentColor" />
      <circle cx="20.5" cy="17" r="1.5" fill="currentColor" />
      {/* Cute Nose */}
      <path d="M15.2 19.8 L 16.8 19.8 L 16 20.6 Z" fill="currentColor" />
      {/* Whiskers */}
      <path
        d="M4 17.5 H 7.5 M4 20.5 H 8 M28 17.5 H 24.5 M28 20.5 H 24"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
