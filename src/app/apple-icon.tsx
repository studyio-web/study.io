import { ImageResponse } from 'next/og';

export const size = {
  width: 180,
  height: 180,
};
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0F172A',
          borderRadius: 40,
          border: '4px solid #1E293B',
        }}
      >
        <svg
          width="124"
          height="124"
          viewBox="0 0 64 64"
          fill="none"
        >
          <path
            d="M32 20C27 16 19 16.5 16 18V44C19 42.5 27 42 32 46C37 42 45 42.5 48 44V18C45 16.5 37 16 32 20Z"
            stroke="#94A3B8"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line
            x1="32"
            y1="20"
            x2="32"
            y2="46"
            stroke="#10B981"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <circle cx="32" cy="14" r="3.75" fill="#10B981" />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}
