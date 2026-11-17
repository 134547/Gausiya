import React from 'react';

export const OFFICIAL_LOGO_URL = '/assets/aistudio/ChatGPT_Image_Nov_6__2026__09_59_52_PM_bd16f337.png';

interface MadrasaLogoProps {
  logoUrl?: string;
  size?: number;
  surface?: 'light' | 'dark';
  className?: string;
}

export const MadrasaLogo: React.FC<MadrasaLogoProps> = ({
  logoUrl,
  size = 36,
  surface = 'light',
  className = '',
}) => {
  const src = logoUrl && logoUrl.trim() ? logoUrl : OFFICIAL_LOGO_URL;

  return (
    <img
      src={src}
      alt="Madrasa Gausiya Razvia"
      referrerPolicy="no-referrer"
      style={{ width: size, height: size }}
      className={`object-contain bg-transparent shrink-0 select-none ${
        surface === 'dark' ? '[filter:drop-shadow(0_0_1.5px_rgba(255,255,255,0.92))]' : ''
      } ${className}`}
    />
  );
};
