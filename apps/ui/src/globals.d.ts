interface ColorSelectionOptions {
  signal?: AbortSignal;
}

interface ColorSelectionResult {
  sRGBHex: string;
}

interface EyeDropper {
  open(options?: ColorSelectionOptions): Promise<ColorSelectionResult>;
}

declare let EyeDropper: {
  prototype: EyeDropper;
  new (): EyeDropper;
};
