'use client';
import { useEffect, useRef, useState } from 'react';

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

/**
 * Reads UPC/EAN codes with the phone camera through the browser's built-in BarcodeDetector (Chrome on Android).
 * Where it isn't available (Safari on iPhone), it says so and the owner types the number.
 */
export function BarcodeScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const W = window as unknown as { BarcodeDetector?: new (o: object) => Detector };
    if (!W.BarcodeDetector) { setError('This browser cannot read barcodes with the camera. Type the numbers under the barcode instead.'); return; }
    const detector = new W.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
    let stream: MediaStream | null = null;
    let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        while (!stop) {
          const found = await detector.detect(video.current).catch(() => []);
          if (found[0]?.rawValue) { onCode(found[0].rawValue); return; }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch {
        setError('The camera could not start. Allow camera access, or type the numbers instead.');
      }
    })();
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [onCode]);

  return (
    <div role="dialog" aria-label="Scan a barcode" className="fixed inset-0 z-50 flex flex-col bg-ground">
      <div className="flex items-center justify-between p-4">
        <p className="font-semibold">Point the camera at the barcode</p>
        <button type="button" onClick={onClose} className="h-11 rounded-md border border-line px-4">Close</button>
      </div>
      {error ? <p className="m-4 rounded-lg border border-line p-4">{error}</p> : <video ref={video} playsInline muted className="w-full flex-1 object-cover" />}
    </div>
  );
}
