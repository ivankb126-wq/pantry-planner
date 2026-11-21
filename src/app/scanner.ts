// Reads barcodes from camera frames with ZXing (WebAssembly). iPhone Safari
// has no built-in barcode reader, so this is the same everywhere. The .wasm
// file is served with the app (never from a CDN), so scanning works offline.
// Loaded only when the scan screen opens.

import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';

prepareZXingModule({
  overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
});

/** The first food-package barcode in a frame, or null. */
export async function readFrame(img: ImageData): Promise<string | null> {
  const found = await readBarcodes(img, { formats: ['EAN13', 'EAN8', 'UPCA', 'UPCE'], tryHarder: true, maxNumberOfSymbols: 1 });
  return found.find((r) => r.isValid)?.text ?? null;
}
