'use client';

import dynamic from 'next/dynamic';

function Splash() {
  return (
    <div className="splash">
      <div className="flex flex-col items-center gap-8">
        <div className="splash-ring" />
        <div className="font-display text-[15px] tracking-[0.5em] text-white/80">EPYC SG</div>
      </div>
    </div>
  );
}

// The studio is all Web Audio, WebGL and keyboard state: it only exists in the browser.
const Studio = dynamic(() => import('./Studio'), { ssr: false, loading: () => <Splash /> });

export default function StudioLoader() {
  return <Studio />;
}
